import { accountViewPaths } from "@daveyplate/better-auth-ui/server";
import {
  AccountView,
  ChangeEmailCard,
  ChangePasswordCard,
  DeleteAccountCard,
  SessionsCard,
  UpdateNameCard,
} from "@daveyplate/better-auth-ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="container p-4 md:p-6">
      <Button asChild className="mb-4 self-start">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>
      <div className="flex flex-1 items-center justify-center">
        {path === "settings" ? (
          <div className="grid w-full max-w-2xl gap-4">
            <UpdateNameCard />
            <ChangeEmailCard />
            <ChangePasswordCard />
            <SessionsCard />
            <DeleteAccountCard />
          </div>
        ) : (
          <AccountView path={path} />
        )}
      </div>
    </main>
  );
}
