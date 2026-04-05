import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RegisterPageContent } from "./register-content"

export const metadata = {
    title: "Register",
    description: "Create an account",
}

export default async function RegisterPage() {
    const session = await auth();
    if (session) redirect("/dashboard/alias");

    return <RegisterPageContent />
}
