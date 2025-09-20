"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { TabsContent } from "@radix-ui/react-tabs";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Loader2, Music, Plus } from "lucide-react";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { generateSong, type GenerateRequest } from "~/actions/generation";

const inspirationTags = [
  "Lofi",
  "Chill",
  "Energetic",
  "Happy",
  "Sad",
  "Angry",
  "Relaxing",
  "Dreamy",
  "Upbeat",
  "Mellow",
  "Groovy",
  "Jazzy",
  "Funky",
  "Soulful",
  "90s Lofi",
  "Dramatic",
  "Mysterious",
  "Hopeful",
  "Calm",
  "Peaceful",
];
//   "80s synth-pop",
//   "Acoustic ballad",
//   "Epic movie score",
//   "Lo-fi hip hop",
//   "Driving rock anthem",
//   "Summer beach vibe",

const styleTags = [
  "Jazz",
  "Classical",
  "Rock",
  "Pop",
  "Hip-Hop",
  "Electronic",
  "Country",
  "Reggae",
  "Blues",
  "Funk",
  "Soul",
  "R&B",
  "Metal",
  "Punk",
  "Indie",
  "Folk",
  "Disco",
  "Orchestral",
  "Soulful vocals",
  "Techno",
];

// "Industrial rave",
//   "Heavy bass",
//   "Electronic beats",
//   "Funky guitar",
//   "Ambient pads",

export function SongPanel() {
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [description, setDescription] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [lyricsMode, setLyricsMode] = useState<"write" | "auto">("write");
  const [lyrics, setLyrics] = useState("");
  const [styleInput, setStyleInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInspirationalTagClick = (tag: string) => {
    const currentTags = description
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);

    if (!currentTags.includes(tag)) {
      if (description.trim() === "") {
        setDescription(tag);
      } else {
        setDescription(description + ", " + tag);
      }
    }
  };

  const handleStyleInputTagClick = (tag: string) => {
    const currentTags = styleInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);

    if (!currentTags.includes(tag)) {
      if (styleInput.trim() === "") {
        setStyleInput(tag);
      } else {
        setStyleInput(styleInput + ", " + tag);
      }
    }
  };

  const handleCreate = async () => {
    if (mode === "simple" && !description.trim()) {
      toast.error("Please provide a description for your song.");
      return;
    }
    if (mode === "custom" && !styleInput.trim()) {
      toast.error("Please provide at least one style for your song.");
      return;
    }

    // Generate Song
    let requestBody: GenerateRequest;

    if (mode === "simple") {
      requestBody = {
        fullDescribedSong: description,
        instrumental: instrumental,
      };
    } else {
      const prompt = styleInput;
      if (lyricsMode === "write") {
        requestBody = {
          prompt,
          lyrics,
          instrumental,
        };
      } else {
        requestBody = {
          prompt,
          describedLyrics: lyrics,
          instrumental,
        };
      }
    }

    try {
      setLoading(true);
      await generateSong(requestBody);
      setDescription("");
      setLyrics("");
      setStyleInput("");
    } catch (error) {
      toast.error("Failed to generate song." + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted/30 flex w-full flex-col border-r lg:w-80">
      <div className="flex-1 overflow-y-auto p-4">
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "simple" | "custom")}
        >
          <TabsList className="w-full">
            <TabsTrigger
              className="data-[state=active]:bg-black data-[state=active]:text-white"
              value="simple"
            >
              Simple
            </TabsTrigger>
            <TabsTrigger
              className="data-[state=active]:bg-black data-[state=active]:text-white"
              value="custom"
            >
              Custom
            </TabsTrigger>
          </TabsList>
          <TabsContent value="simple" className="mt-6 space-y-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Describe your song</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A dreamy lofi hip-hop track with a chill beat and a smooth saxophone melody..."
                className="min-h-[120px] resize-none"
              />
            </div>

            {/* Lyrics button and instrumental toggle */}
            <div className="flex items-center justify-between">
              {/* variant="outline" in Button */}
              <Button size="sm" onClick={() => setMode("custom")}>
                <Plus className="mr-2" />
                Lyrics
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Instrumental</label>
                <Switch
                  checked={instrumental}
                  onCheckedChange={setInstrumental}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Inspiration</label>
              <div className="overflow-x-auto w-full whitespace-nowrap">
                <div className="flex gap-2 pb-2">
                  {inspirationTags.map((tag) => (
                    <Button
                      size="sm"
                      className="h-7 flex-shrink-0 bg-transparent text-xs"
                      key={tag}
                      variant="outline"
                      onClick={() => handleInspirationalTagClick(tag)}
                    >
                      <Plus className="mr-1" />
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="custom" className="mt-6 space-y-6">
            <div className="flex flex-col gap-3">
              <div className="item-center flex justify-between">
                <label className="text-sm font-medium">Lyrics</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={lyricsMode === "auto" ? "default" : "ghost"}
                    onClick={() => {
                      setLyricsMode("auto");
                      setLyrics("");
                    }}
                    size="sm"
                    className="h-7 text-sm"
                  >
                    Auto
                  </Button>

                  <Button
                    variant={lyricsMode === "write" ? "default" : "ghost"}
                    onClick={() => {
                      setLyricsMode("write");
                      setLyrics("");
                    }}
                    size="sm"
                    className="h-7 text-sm"
                  >
                    Write
                  </Button>
                </div>
              </div>

              <Textarea
                placeholder={
                  lyricsMode === "write"
                    ? "Write your own lyrics here..."
                    : "AI will generate lyrics for your song based on your description..."
                }
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Instrumental</label>
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
              />
            </div>

            {/* Styles */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Styles</label>
              <Textarea
                placeholder="Enter your desired styles here..."
                value={styleInput}
                onChange={(e) => setStyleInput(e.target.value)}
                className="min-h-[60px] resize-none"
              />
              <div className="w-full overflow-x-auto whitespace-nowrap">
                <div className="flex gap-2 pb-2">
                  {styleTags.map((tag) => (
                    <Badge
                      variant="secondary"
                      key={tag}
                      className="hover:bg-secondary/80 flex-shrink-0 cursor-pointer text-xs"
                      onClick={() => handleStyleInputTagClick(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="border-t p-4">
        <Button
          onClick={handleCreate}
          disabled={loading}
          className="w-full cursor-pointer bg-gradient-to-r from-orange-500 to-pink-500 font-medium text-white hover:from-orange-600 hover:to-pink-600"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Music />}
          {loading ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
