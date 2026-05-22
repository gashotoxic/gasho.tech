import { readFileSync, writeFileSync, existsSync } from "fs"
import { createInterface } from "readline"

const DATA_FILE = new URL("../data/blogs.json", import.meta.url)
const SAMPLE_FILE = "/tmp/victor-blog-draft.json"

/**
 * Generate a URL-friendly slug from a title string.
 * Lowercases, replaces non-alphanumeric chars with hyphens, collapses runs.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Read existing blogs from the JSON data file.
 */
function readBlogs() {
  if (!existsSync(DATA_FILE)) {
    return { posts: [] }
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf-8"))
}

/**
 * Write the full posts object back to the JSON data file.
 */
function writeBlogs(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

/**
 * Parse stdin as JSON. Returns null if piped input is empty or not valid JSON.
 */
async function readStdin() {
  return new Promise((resolve) => {
    const lines = []
    const rl = createInterface({ input: process.stdin })

    rl.on("line", (line) => lines.push(line))
    rl.on("close", () => {
      const raw = lines.join("")
      if (!raw.trim()) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        console.error("Error: stdin is not valid JSON")
        resolve(null)
      }
    })
  })
}

async function main() {
  // 1. Try to read from stdin first
  let post = await readStdin()

  // 2. Fall back to sample file if no stdin
  if (!post) {
    if (!existsSync(SAMPLE_FILE)) {
      console.error(`Error: No stdin provided and sample file ${SAMPLE_FILE} not found.`)
      process.exit(1)
    }
    const sampleRaw = readFileSync(SAMPLE_FILE, "utf-8")
    try {
      post = JSON.parse(sampleRaw)
    } catch {
      console.error(`Error: Sample file ${SAMPLE_FILE} is not valid JSON.`)
      process.exit(1)
    }
  }

  // 3. Validate required fields
  const required = ["title", "excerpt", "content", "author", "category", "image", "date"]
  for (const field of required) {
    if (!post[field]) {
      console.error(`Error: Missing required field "${field}".`)
      process.exit(1)
    }
  }

  // 4. Generate slug and build the post entry
  const entry = {
    slug: slugify(post.title),
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    author: post.author,
    category: post.category,
    date: post.date,
    image: post.image,
    published: post.published !== undefined ? post.published : true,
  }

  // 5. Read existing data and append
  const data = readBlogs()
  data.posts.push(entry)

  // 6. Write back
  writeBlogs(data)

  console.log(`Blog post "${entry.title}" ingested successfully (slug: ${entry.slug}).`)
  console.log(`Total posts: ${data.posts.length}`)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
