"use client";

import { authClient } from "~/lib/auth-client";
import { Button } from "../ui/button";

export default function Upgrade() {
  const upgrade = async () => {
    await authClient.checkout({
      products: [
        "b185c753-6225-4e8a-b65b-d83ad6fefdcd",
        "760e1613-77eb-4b41-90ce-c1a6acead4e2",
        "9198b957-401f-45c7-8202-67dc93741f1b",
      ],
    });
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-2 cursor-pointer text-red-400"
      onClick={upgrade}
    >
      Upgrade
    </Button>
  );
}
