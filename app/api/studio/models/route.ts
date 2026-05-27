import { NextResponse } from 'next/server'
import { getProviderModels } from '@/lib/studio-api'

export async function GET() {
  try {
    const models = await getProviderModels()

    // Sort by provider then name
    models.sort((a, b) => {
      if (a.provider === b.provider) {
        return a.name.localeCompare(b.name)
      }
      return a.provider.localeCompare(b.provider)
    })

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Failed to fetch models:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available models' },
      { status: 500 }
    )
  }
}
