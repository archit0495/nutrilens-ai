import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './profile-form'
import type { ActivityLevel, Goal, Sex } from '@/lib/nutrition/calculator'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.onboarded) redirect('/onboarding')

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-2xl mx-auto anim-fade-up">
        {/* Page heading. TopNav in the root layout handles the back-to-dashboard affordance via the logo/Today link. */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit profile</h1>
          <p className="text-sm text-gray-600 mt-1">
            Update your stats and we&apos;ll recalculate your targets.
          </p>
        </div>

        <ProfileForm
          initial={{
            full_name: profile.full_name ?? '',
            age: profile.age ?? 0,
            sex: (profile.sex as Sex) ?? 'male',
            height_cm: profile.height_cm ?? 0,
            weight_kg: profile.weight_kg ?? 0,
            activity_level: (profile.activity_level as ActivityLevel) ?? 'moderate',
            goal: (profile.goal as Goal) ?? 'maintain',
          }}
          currentTargets={{
            calories: profile.target_calories ?? 0,
            protein_g: profile.target_protein_g ?? 0,
            carbs_g: profile.target_carbs_g ?? 0,
            fat_g: profile.target_fat_g ?? 0,
          }}
        />
      </div>
    </div>
  )
}
