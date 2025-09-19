import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link"
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CreateSong from "~/components/create";
import TrackListFetcher from "~/components/create/track-list-fetch";
import { SongPanel } from "~/components/create/song-panel";
import { auth } from "~/lib/auth";

export default async function HomePage() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect("/auth/sign-in")
    }

    return (
        <div className="flex h-full flex-col lg:flex-row">
            <SongPanel/>
            <Suspense fallback={
                <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin"/>
                </div>}>
                <TrackListFetcher/>
            </Suspense>
        </div>
    );
}