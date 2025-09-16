import base64
import uuid
import modal
import os
import requests
import boto3

from typing import List
from pydantic import BaseModel

from prompts import LYRICS_GENERATOR_PROMPT, PROMPT_GENERATOR_PROMPT


app = modal.App("music-generator")

# Use a minimal Debian "slim" image as the base for our environment.
# We then install the Python packages our code will need into that image.
image = (
    modal.Image.debian_slim()
    .apt_install("git")
    .pip_install_from_requirements("requirements.txt")
    .run_commands(["git clone https://github.com/ace-step/ACE-Step.git /tmp/ACE-Step", "cd /tmp/ACE-Step && pip install ."])
    .env({"HF_HOME": "/.cache/huggingface"})
    .add_local_python_source("prompts")
)


model_volume = modal.Volume.from_name(
    "ace-steps-models", create_if_missing=True)
hf_volume = modal.Volume.from_name(
    "qwen-hf-cache", create_if_missing=True)


music_gen_secrets = modal.Secret.from_name("music-gen-secret")


class AudioGenerationBase(BaseModel):
    audio_duration: float = 180.0
    seed: int = -1
    guidance_scale: float = 15.0
    infer_step: int = 60
    instrumental: bool = False
    
class GenerateFromDescriptionRequest(AudioGenerationBase):
    full_described_song: str
    
class GenerateWithCustomLyricsRequest(AudioGenerationBase):
    prompt: str
    lyrics: str
    
class GenerateWithDescribedLyricsRequest(AudioGenerationBase):
    prompt: str
    described_lyrics: str
    

class GenerateMusicResponse(BaseModel):
    audio_data: str
    
class GenerateMusicResponseS3(BaseModel):
    s3_key: str
    cover_image_s3_key: str
    categories: List[str]
    

@app.cls(
    image= image,
    gpu="L40S",
    volumes={"/models": model_volume, "/.cache/huggingface": hf_volume},
    secrets = [music_gen_secrets],
    scaledown_window = 15
)

class MusicGenServer:
    @modal.enter()
    
    def load_model(self):
        from acestep.pipeline_ace_step import ACEStepPipeline # type: ignore
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from diffusers import AutoPipelineForText2Image
        import torch
            
        # Music Generation Model 
        self.music_model = ACEStepPipeline(
            checkpoint_dir = "/models",
            dtype="bfloat16",
            torch_compile=False,
            cpu_offload=False,
            overlapped_decode=False
        )
        
        
        # LLM 
        model_id = "Qwen/Qwen2-7B-Instruct"
        self.tokenizer = AutoTokenizer.from_pretrained(model_id)
        self.llm_model = AutoModelForCausalLM.from_pretrained(  
            model_id,
            torch_dtype="auto",
            device_map="auto",
            cache_dir="/.cache/huggingface"
        )
        
        # Stable Diffusion Model (thumbnails)
        self.image_pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo", 
            torch_dtype=torch.float16, 
            variant="fp16",
            cache_dir="/.cache/huggingface"
        )
        self.image_pipe.to("cuda")
        
        
    # From Hugging Face
    def prompt_qwen(self, question: str):
        messages = [
            {"role": "user", "content": question}
        ]
        text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        model_inputs = self.tokenizer([text], return_tensors="pt").to(self.llm_model.device)

        generated_ids = self.llm_model.generate(
            model_inputs.input_ids,
            max_new_tokens=512
        )
        generated_ids = [
            output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]

        response = self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        return response
        
         
    def generate_prompt(self, description: str):
        #Insert description into template
        full_prompt = PROMPT_GENERATOR_PROMPT.format(user_prompt = description)
        
        #Run LLM inference and return it
        return self.prompt_qwen(full_prompt)
        
    def generate_lyrics(self, description: str):
        #Insert description into template
        full_prompt = LYRICS_GENERATOR_PROMPT.format(description = description)
        
        #Run LLM inference and return it
        return self.prompt_qwen(full_prompt)
    
    def generate_categories(self, description: str) -> List[str]:
        prompt = f"Based on the following music description, list 3-5 relevant genres or categories as a comma separated list. For example Pop, Electronic, Sad, 90s. Description: '{description}'"
        
        response_text = self.prompt_qwen(prompt)
        #Make a List of the categories recieved in response_text
        categories = [cat.strip() 
                      for cat in response_text.split(",") if cat.strip()]
        return categories
    
    
    def generate_and_upload_to_s3(
        self,
        prompt: str,
        lyrics: str,
        instrumental: bool,
        audio_duration: float,
        infer_step: int,
        guidance_scale: float,
        seed: int,
        description_for_categories: str,
    ) -> GenerateMusicResponseS3:
        final_lyrics = "[instrumental]" if instrumental else  lyrics
        print(f"Generated Lyrics: \n{final_lyrics}")
        print(f"Prompt: \n{prompt}")
        
        
    #AWS -> S3 Bucket : Thumbnail, songs
    #    -> IAM Users : 
    #                   - Frontend (nextJS) : GetObject, ListObject
    #                   - Backend (modal) : PutObject, GetObject, ListObject
    
        s3_client = boto3.client("s3")
        bucket_name = os.environ["S3_BUCKET_NAME"]
        
        output_dir = "/tmp/outputs"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{uuid.uuid4()}.wav")
        
        
        #Music Generation
        self.music_model(
            prompt = prompt,
            lyrics = final_lyrics,
            audio_duration = audio_duration,
            infer_step = infer_step,
            guidance_scale = guidance_scale,
            save_path = output_path,
            manual_seeds = str(seed)
        )
        
        # After Music Generation, check if the file is created 
        print(f"Checking if file exists: {output_path} -> {os.path.exists(output_path)}")
        if os.path.exists(output_path):
            print(f"File size: {os.path.getsize(output_path)} bytes")
        else:
            print("File not found after music generation!")
            
        #uploading to S3 Bucket
        audio_s3_key = f"{uuid.uuid4()}.wav"
        s3_client.upload_file(output_path, bucket_name, audio_s3_key)
        os.remove(output_path)
        
        
        #Thumbnail Generation
        thumbnail_prompt = f"{prompt}, album cover art"
        image = self.image_pipe(prompt = thumbnail_prompt, num_inference_steps=2, guidance_scale=0.0).images[0]
        image_output_path = os.path.join(output_dir, f"{uuid.uuid4()}.png")
        image.save(image_output_path)
        
        #uploading to S3 Bucket
        image_s3_key = f"{uuid.uuid4()}.png"
        s3_client.upload_file(image_output_path, bucket_name, image_s3_key)
        os.remove(image_output_path)
        
        
        #Category Generation : "hip-hop", "rock"...
        categories = self.generate_categories(description=description_for_categories)
        return GenerateMusicResponseS3(
            s3_key=audio_s3_key,
            cover_image_s3_key= image_s3_key,
            categories=categories
        )
    
        
    #TYPE-0 
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate(self) -> GenerateMusicResponse:
        output_dir = "/tmp/outputs"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{uuid.uuid4()}.wav")
        
        self.music_model(
            prompt = "pop, soul, singer-songwriter, emotional pop, dramatic",
            lyrics = "[Verse 1]\nI fell by the wayside like everyone else\nI hate you, I hate you, I hate you, but I was just kidding myself\nOur every moment, I start to replace\n'Cause now that they're gone, all I hear are the words that I needed to say\n\n[Pre-Chorus]\nWhen you hurt under the surface\nLike troubled water running cold\nWell, time can heal, but this won't\n\n[Chorus]\nSo before you go\nWas there something I coulda said to make your heart beat better?\nIf only I'da known you had a storm to weather\nSo before you go\nWas there something I coulda said to make it all stop hurting?",
            audio_duration = 205,
            infer_step = 60,
            guidance_scale = 15,
            save_path = output_path
        )
        
        with open(output_path, "rb") as f:
            audio_bytes = f.read()
            
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        
        os.remove(output_path)
        
        return GenerateMusicResponse(audio_data = audio_b64)
    
    
    # TYPE-1 => S3 Music (.wav) + Thumbnail (.png) Generation with a description as input
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_from_description(self, request: GenerateFromDescriptionRequest) -> GenerateMusicResponseS3:
        #Generating a prompt
        prompt = self.generate_prompt(request.full_described_song)
        #Generating the lyrics
        lyrics = ""
        if not request.instrumental:
            lyrics = self.generate_lyrics(request.full_described_song)
        return self.generate_and_upload_to_s3(prompt=prompt, 
                                              lyrics=lyrics, 
                                              description_for_categories=request.full_described_song,
                                              **request.model_dump(exclude={"full_described_song"}))
            
    
    # TYPE-2 => S3 Music (.wav) + Thumbnail (.png) Generation with a prompt and the lyrics as input
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_with_lyrics(self, request: GenerateWithCustomLyricsRequest) -> GenerateMusicResponseS3:
        return self.generate_and_upload_to_s3(prompt=request.prompt, 
                                              lyrics=request.lyrics, 
                                              description_for_categories=request.prompt,
                                              **request.model_dump(exclude={"prompt", "lyrics"}))
        
        
    # TYPE-3 => S3 Music (.wav) + Thumbnail (.png) Generation with a prompt and the lyrics description as input
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_with_described_lyrics(self, request: GenerateWithDescribedLyricsRequest) -> GenerateMusicResponseS3:
        #Generating the lyrics
        lyrics = ""
        if not request.instrumental:
            lyrics = self.generate_lyrics(request.described_lyrics)
        return self.generate_and_upload_to_s3(prompt=request.prompt, 
                                              lyrics=lyrics, 
                                              description_for_categories=request.prompt,
                                              **request.model_dump(exclude={"prompt", "described_lyrics"}))


    
# TYPE-1 => S3 Music (.wav) + Thumbnail (.png) Generation with a description as input
# @app.local_entrypoint()
# def main():
#     server = MusicGenServer()
#     endpoint_url = server.generate_from_description.get_web_url()
    
#     request_data = GenerateFromDescriptionRequest(
#         full_described_song="A heartfelt pop song about overcoming challenges and finding hope in difficult times.",
#         guidance_scale=12
#     )
    
#     payload = request_data.model_dump()
    
#     response = requests.post(endpoint_url, json= payload)
#     response.raise_for_status()
#     result = GenerateMusicResponseS3(**response.json())
    
#     print(f"Success: {result.s3_key} {result.cover_image_s3_key} {result.categories}")



# TYPE-2 => S3 Music (.wav) + Thumbnail (.png) Generation with a prompt and the lyrics as input
# @app.local_entrypoint()
# def main():
#     server = MusicGenServer()
#     endpoint_url = server.generate_with_lyrics.get_web_url()
    
#     request_data = GenerateWithCustomLyricsRequest(
#         prompt= "melancholic, world, sad, 90s, slow-to-fast-rhythm",
#         lyrics= """[Verse]
#                     In a world so grand he roams the skies alone
#                     His heart a heavy stone a tale untold
#                     Whispers of his past echo through the night
#                     A lonely dragon searching for the light
#                 """,
#         guidance_scale=13
#     )
    
#     payload = request_data.model_dump()
 
#     response = requests.post(endpoint_url, json= payload)
#     response.raise_for_status()
#     result = GenerateMusicResponseS3(**response.json())
    
#     print(f"Success: {result.s3_key} {result.cover_image_s3_key} {result.categories}")



# TYPE-3 => S3 Music (.wav) + Thumbnail (.png) Generation with a prompt and the lyrics description as input
@app.local_entrypoint()
def main():
    server = MusicGenServer()
    endpoint_url = server.generate_with_described_lyrics.get_web_url()
    
    request_data = GenerateWithDescribedLyricsRequest(
        prompt= "sad, fast, 100bpm, mesmerizing",
        described_lyrics= "lyrics about how the flower is dying and how the world is ending." ,
        guidance_scale=15
    )

    
    payload = request_data.model_dump()
    
    response = requests.post(endpoint_url, json= payload)
    response.raise_for_status()
    result = GenerateMusicResponseS3(**response.json())
    
    print(f"Success: {result.s3_key} {result.cover_image_s3_key} {result.categories}")

    
    
# Local Device .wav generation
    # audio_bytes = base64.b64decode(result.audio_data)
    # output_filename = "generated.wav"
    # with open(output_filename, "wb") as f:
    #     f.write(audio_bytes)