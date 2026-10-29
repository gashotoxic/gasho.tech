import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

/**
 * What a reader sees when the archive could not be read at all.
 *
 * This is deliberately not the empty state, and not a 404. `/api/blogs` answers
 * 503 when neither the repository nor the deployed snapshot holds a post list,
 * and an index page that mapped every non-ok response to `[]` rendered "No blog
 * posts yet" — telling readers the blog is empty when the truth is that it is
 * unavailable, and letting a shared cache keep that lie for a minute. A post page
 * that mapped it to `notFound()` did the same thing one URL at a time.
 */
export function BlogUnavailable({ what }: { what: 'index' | 'post' }) {
  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-2xl text-center py-16">
        <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-[#1abc9c]" />
        <h1 className="text-2xl font-bold mb-3">
          {what === 'index' ? 'The blog is temporarily unavailable' : 'This post cannot be shown right now'}
        </h1>
        <p className="text-foreground/70 dark:text-[#cccccc] mb-2">
          {what === 'index'
            ? 'We could not load the archive just now. Nothing has been taken down — please try again in a minute.'
            : 'We could not load the archive, so this post cannot be shown. It has not been removed — please try again in a minute.'}
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Everything published is still there; only the list behind it failed to load.
        </p>
        <Link
          href="/blogs"
          className="inline-flex items-center gap-2 bg-[#1abc9c] hover:bg-[#16a085] text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the blog
        </Link>
      </div>
    </div>
  )
}
