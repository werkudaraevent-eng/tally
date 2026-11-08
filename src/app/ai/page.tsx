import { getCurrentUser } from "@/lib/auth/login";
import { AiWorkspace } from "./ai-workspace";

/** AI untuk seluruh Tally: kunci, model, batas bulanan, dan pemakaian. Gerbang di layout. */
export default async function AiPage() {
  const user = await getCurrentUser();
  return <AiWorkspace username={user?.username ?? null} role={user?.role ?? null} />;
}
