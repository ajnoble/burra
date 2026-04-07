# Setting Up a New Organisation

This guide walks through creating a new organisation on Snow Gum.

## Prerequisites

- SSH access to the server (or local dev environment)
- The `.env` file must contain:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL` (e.g. `https://snowgum.site`)
  - `DATABASE_URL`

## Steps

### 1. Run the setup script

```bash
npm run setup-org
```

You will be prompted for:
- **Organisation name** — displayed in the UI and emails (e.g. "Bogong Ski Club")
- **URL slug** — the URL path for this org (e.g. `bogong` -> `snowgum.site/bogong`). Lowercase, no spaces.
- **Contact email** — displayed to members and used as reply-to on emails
- **Timezone** — defaults to `Australia/Melbourne`
- **First admin** — name and email for the initial ADMIN user

The script will:
1. Create the organisation with a default "Full Member" membership class
2. Create (or reuse) a Supabase auth account for the admin
3. Create the member record with ADMIN role
4. Print an invite link (for new users) or confirm they can log in (existing users)

### 2. Send the invite link to the admin

If the admin is a new user, send them the invite link printed by the script. They will:
1. Click the link
2. Set their password
3. Land on their dashboard

If they are an existing user (already a member of another org), they can log in at `snowgum.site/{slug}/login` with their existing credentials. The root page (`snowgum.site/`) will also show both organisations.

### 3. Admin completes setup

Once logged in, the admin should:
1. **Membership classes** — edit or add classes at Admin > Settings (the script creates a default "Full Member" class)
2. **Lodge & rooms** — configure the lodge, rooms, and beds at Admin > Lodges
3. **Seasons & booking rounds** — set up the season calendar at Admin > Seasons
4. **Tariffs** — configure pricing at Admin > Tariffs
5. **Stripe Connect** — connect a Stripe account at Admin > Settings for payment processing
6. **Members** — add members at Admin > Members (each gets an invite email automatically)

## Multi-org users

A single email address can be a member of multiple organisations. When a user who belongs to multiple orgs visits `snowgum.site/`, they see an org picker. Users with a single org are redirected straight to their dashboard.
