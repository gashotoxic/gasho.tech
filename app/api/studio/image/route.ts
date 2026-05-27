import { NextResponse } from 'next/server'
import { generateImage } from '@/lib/studio-api'

const PROMPT_TEMPLATES = {
  AI: [
    "futuristic neural network visualization with glowing connections, dark background, turquoise #1abc9c accents, high quality",
    "humanoid robot working alongside humans in modern office, professional tech aesthetic, clean lighting",
    "AI concept visualization with floating data nodes and connections, dark theme, turquoise accents",
  ],
  Cybersecurity: [
    "cybersecurity shield protecting digital data streams, matrix code background, green #1abc9c accents, high quality",
    "network security team monitoring screens, modern SOC environment, professional photography style, dark theme",
    "cyber defense concept with firewalls and encrypted data, dark professional theme, tech aesthetic",
  ],
  ICT: [
    "data center servers with fiber optic cables, blue and green lighting, professional tech, clean aesthetic",
    "cloud infrastructure visualization with connected nodes, modern enterprise aesthetic, professional style",
    "network infrastructure diagram with servers and connectivity, clean professional style, tech theme",
  ],
  Technology: [
    "cutting-edge technology workspace with multiple screens, modern office, turquoise #1abc9c accents, professional",
    "innovation lab with emerging tech devices, professional photography style, clean lighting, corporate aesthetic",
    "digital transformation concept with floating UI elements, corporate tech aesthetic, modern design",
  ],
  News: [
    "breaking news broadcast setup with screens, modern newsroom, professional journalism, dark theme",
    "technology news concept with data visualizations, clean editorial style, professional layout",
    "global tech news hub with interconnected information, international perspective, modern design",
  ],
} as const

export interface ImageRequest {
  title: string
  category: string
  style?: string
}

export async function POST(request: Request) {
  try {
    const body: ImageRequest = await request.json()

    if (!body.title || !body.category) {
      return NextResponse.json(
        { error: 'Missing required fields: title, category' },
        { status: 400 }
      )
    }

    // Get prompt templates for category
    const categoryTemplates = PROMPT_TEMPLATES[body.category as keyof typeof PROMPT_TEMPLATES]

    if (!categoryTemplates) {
      // Fallback template
      const fallbackPrompt = `Professional blog header image for "${body.title}". Dark background with turquoise #1abc9c accents. Technology theme. High quality, cinematic lighting.`
      const result = await generateImage(fallbackPrompt)
      return NextResponse.json(result)
    }

    // Select prompt based on style preference
    let selectedPrompt: string
    if (body.style && typeof body.style === 'string') {
      // User provided custom style
      const styleIndex = Math.min(body.style.length % categoryTemplates.length, categoryTemplates.length - 1)
      selectedPrompt = categoryTemplates[styleIndex]
    } else {
      // Random selection from category templates
      const randomIndex = Math.floor(Math.random() * categoryTemplates.length)
      selectedPrompt = categoryTemplates[randomIndex]
    }

    // Enhance prompt with title
    const finalPrompt = `${selectedPrompt} Blog title: "${body.title}". 1200x630 aspect ratio, 16:9.`

    console.log('Generating image with prompt:', finalPrompt)

    const result = await generateImage(finalPrompt)

    if (!result.success) {
      console.error('Image generation failed:', result.error)
      return NextResponse.json(
        {
          error: 'Image generation failed',
          imageData: '',
          prompt: finalPrompt,
          fallbackPrompt: `Use this prompt on any AI image generator: "${finalPrompt}"`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      imageData: result.imageData,
      prompt: finalPrompt,
    })
  } catch (error) {
    console.error('Image generation failed:', error)
    return NextResponse.json(
      {
        error: 'Image generation failed',
        imageData: '',
        fallbackPrompt: `Use this prompt on any AI image generator: "Professional blog header image for ${body.title}. Dark background with turquoise #1abc9c accents. ${body.category} theme. 1200x630 aspect ratio, high quality."`,
      },
      { status: 500 }
    )
  }
}
