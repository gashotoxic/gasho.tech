import { NextResponse } from 'next/server'
import { readAdminAuth } from '@/lib/auth'
import { getProviderModels } from '@/lib/studio-api'

// Only a signed admin session may enumerate the studio's model list: it is
// internal config, and keeping one boundary on `/api/studio/*` beats a route
// that answers anonymously and invites the next caller to assume the others do.
export async function GET(request: Request) {
  try {
    if (readAdminAuth(request) !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
