import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "~/server/db";
import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";
import {
  polar,
  checkout,
  portal,
  webhooks,
} from "@polar-sh/better-auth";

const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: "sandbox",
});

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql", // or "mysql", "postgresql", ...etc
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            {
              productId: "b185c753-6225-4e8a-b65b-d83ad6fefdcd",
              slug: "small", // 15 credits
            },
            {
              productId: "760e1613-77eb-4b41-90ce-c1a6acead4e2",
              slug: "medium", // 25 credits
            },
            {
              productId: "9198b957-401f-45c7-8202-67dc93741f1b",
              slug: "large", // 50 credits
            },
          ],
          successUrl: "/",
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          secret: env.POLAR_WEBHOOK_SECRET,
          onOrderPaid: async (order) => {
            const externalCustomerId = order.data.customer.externalId;

            if (!externalCustomerId) {
              console.error("No external customer ID found on order");
              throw new Error("No external customer ID found on order");
            }

            const productId = order.data.productId;

            let creditsToAdd = 0;

            switch (productId) {
              case "b185c753-6225-4e8a-b65b-d83ad6fefdcd":
                creditsToAdd = 15;
                break;
              case "760e1613-77eb-4b41-90ce-c1a6acead4e2":
                creditsToAdd = 25;
                break;
              case "9198b957-401f-45c7-8202-67dc93741f1b":
                creditsToAdd = 50;
                break;
            }

            await db.user.update({
              where: {
                id: externalCustomerId,
              },
              data: {
                credits: {
                  increment: creditsToAdd,
                },
              },
            });
          },
        }),
      ],
    }),
  ],
});
