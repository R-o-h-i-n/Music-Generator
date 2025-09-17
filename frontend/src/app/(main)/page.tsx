import { headers } from "next/headers";
import Link from "next/link"
import { redirect } from "next/navigation";
import CreateSong from "~/components/create";
import { auth } from "~/lib/auth";

export default async function HomePage() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect("/auth/sign-in")
    }

    return (
        // classname adhuri hai
        <main className="flex min-h-screen flex-col items-center">
            <p>Dashboard</p>
            <CreateSong />
        </main>
    );
}