import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => ({
        email: (() => {
          if (params.flow !== "signIn") throw new Error("SIGNUP_DISABLED");
          return String(params.email ?? "admin@welist.local").toLowerCase();
        })(),
      }),
    }),
  ],
});
