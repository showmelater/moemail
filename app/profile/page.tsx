import { Header } from "@/components/layout/header"
import { ProfileCard } from "@/components/profile/profile-card"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export const runtime = "edge"

export default async function ProfilePage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 lg:px-8 max-w-[1600px]">
        <Header />
        <main className="pt-20 pb-5">
          <ProfileCard user={session.user} />
        </main>
      </div>
    </div>
  )
} 