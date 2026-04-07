import "dotenv/config";
import { db } from "@/db/index";
import {
  organisations,
  membershipClasses,
  members,
  organisationMembers,
  profiles,
} from "@/db/schema";
import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("\n  Snow Gum — New Organisation Setup\n");

  // Collect org details
  const orgName = await ask("Organisation name: ");
  const slug = await ask("URL slug (lowercase, no spaces): ");
  const contactEmail = await ask("Contact email: ");
  const timezone =
    (await ask("Timezone [Australia/Melbourne]: ")) || "Australia/Melbourne";

  // Collect first admin details
  console.log("\n--- First Admin Member ---");
  const adminFirstName = await ask("First name: ");
  const adminLastName = await ask("Last name: ");
  const adminEmail = await ask("Email: ");

  rl.close();

  console.log("\nCreating organisation...");

  // Create org
  const [org] = await db
    .insert(organisations)
    .values({ name: orgName, slug, contactEmail, timezone })
    .returning();

  // Create a default membership class
  const [defaultClass] = await db
    .insert(membershipClasses)
    .values({
      organisationId: org.id,
      name: "Full Member",
      sortOrder: 0,
    })
    .returning();

  console.log(`Organisation created: ${org.name} (/${org.slug})`);

  // Create Supabase auth user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  let authUserId: string;
  let isNewUser = false;

  const existingUser = existingUsers?.users.find(
    (u) => u.email === adminEmail
  );

  if (existingUser) {
    authUserId = existingUser.id;
    console.log(`Auth user already exists: ${adminEmail}`);
  } else {
    const { data: newUser, error } =
      await adminClient.auth.admin.createUser({
        email: adminEmail,
        email_confirm: false,
      });

    if (error || !newUser) {
      console.error("Failed to create auth user:", error);
      process.exit(1);
    }

    authUserId = newUser.user.id;
    isNewUser = true;
    console.log(`Auth user created: ${adminEmail}`);
  }

  // Upsert profile
  await db
    .insert(profiles)
    .values({
      id: authUserId,
      email: adminEmail,
      fullName: `${adminFirstName} ${adminLastName}`,
    })
    .onConflictDoNothing();

  // Create member + ADMIN role
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      membershipClassId: defaultClass.id,
      profileId: authUserId,
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      isFinancial: true,
    })
    .returning();

  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: "ADMIN",
  });

  console.log(`Admin member created: ${adminFirstName} ${adminLastName}`);

  // Generate invite link for new users
  if (isNewUser) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email: adminEmail,
        options: {
          redirectTo: `${appUrl}/api/auth/callback?next=/${slug}/auth/set-password`,
        },
      });

    if (linkError || !linkData) {
      console.error("Failed to generate invite link:", linkError);
      console.log(
        "The admin can use 'Forgot password' to set up their account."
      );
    } else {
      console.log(`\nInvite link (expires in 24h):`);
      console.log(linkData.properties.action_link);
    }
  } else {
    console.log(`\nExisting user — they can log in at /${slug}/login`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log("\nSetup complete!");
  console.log(`   Dashboard: ${appUrl}/${slug}/dashboard`);
  console.log(`   Admin:     ${appUrl}/${slug}/admin\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
