import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);

  if (!org) notFound();

  return (
    <LoginForm slug={slug} orgName={org.name} />
  );
}
