import { NextResponse } from 'next/server'
import { getProviderModels } from '@/lib/studio-api'

export async function GET() {
  try {
    const models = await getProviderModels()

    // Sort by name (single provider)
    models.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Failed to fetch models:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available models' },
      { status: 500 }
    )
  }
}
