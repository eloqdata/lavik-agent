import Link from "next/link";
import type { Article, Locale } from "../../../packages/content/schema";
import { articlePath } from "../../../packages/content/repository";
import { blogTopics, type BlogTopic } from "../../../packages/blog/topics";
import {
  blogPresentation,
  sortedBlogPosts,
  blogSections,
} from "../../../packages/blog/presentation";
import "./blog.css";

export const blogTopicPath = (locale: Locale, topic: BlogTopic) =>
  `/${locale}/blog/topic/${topic}/`;

export function BlogSidebar({
  locale,
  posts,
  topic,
  activeArticle,
}: {
  locale: Locale;
  posts: Article[];
  topic?: BlogTopic;
  activeArticle?: string;
}) {
  const zh = locale === "zh-CN";
  const sorted = sortedBlogPosts(posts);
  return (
    <aside
      className="blog-sidebar"
      aria-label={zh ? "博客导航" : "Blog navigation"}
    >
      <div className="blog-sidebar-inner">
        <Link
          className="blog-all-posts"
          href={`/${locale}/blog/`}
          aria-current={!topic && !activeArticle ? "page" : undefined}
        >
          {zh ? "全部文章" : "All posts"}
          <span>{sorted.length}</span>
        </Link>
        <nav
          className="blog-recent"
          aria-label={zh ? "最近文章" : "Recent posts"}
        >
          <h2>{zh ? "最近文章" : "Recent"}</h2>
          <ul>
            {sorted.slice(0, 5).map((post) => (
              <li key={post.id}>
                <Link
                  href={articlePath(post)}
                  aria-current={activeArticle === post.id ? "page" : undefined}
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <details className="blog-recent-mobile">
          <summary>{zh ? "最近文章" : "Recent"}</summary>
          <nav aria-label={zh ? "最近文章" : "Recent posts"}>
            <ul>
              {sorted.slice(0, 5).map((post) => (
                <li key={post.id}>
                  <Link
                    href={articlePath(post)}
                    aria-current={
                      activeArticle === post.id ? "page" : undefined
                    }
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
        <nav className="blog-topics" aria-label={zh ? "主题" : "Topics"}>
          <h2>{zh ? "主题" : "Topics"}</h2>
          <ul>
            {blogTopics.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={blogTopicPath(locale, entry.id)}
                  aria-current={topic === entry.id ? "page" : undefined}
                >
                  <span>{entry.label[locale]}</span>
                  <span className="blog-topic-count">
                    {
                      sorted.filter((post) =>
                        blogPresentation(post).topics.includes(entry.id),
                      ).length
                    }
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

export function BlogCover({
  article,
  priority = false,
}: {
  article: Article;
  priority?: boolean;
}) {
  return (
    <img
      className="blog-cover"
      src={blogPresentation(article).cover}
      alt=""
      width={1200}
      height={450}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}

export function BlogTopicLinks({ article }: { article: Article }) {
  const presentation = blogPresentation(article);
  return (
    <ul
      className="blog-tags"
      aria-label={article.locale === "en" ? "Article topics" : "文章主题"}
    >
      {presentation.topics.map((id) => (
        <li key={id}>
          <Link href={blogTopicPath(article.locale, id)}>
            {blogTopics.find((topic) => topic.id === id)!.label[article.locale]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BlogIndex({
  locale,
  posts,
  topic,
}: {
  locale: Locale;
  posts: Article[];
  topic?: BlogTopic;
}) {
  const zh = locale === "zh-CN";
  const sorted = sortedBlogPosts(posts);
  const selected = topic
    ? blogTopics.find((entry) => entry.id === topic)!
    : undefined;
  const visible = selected
    ? sorted.filter((article) =>
        blogPresentation(article).topics.includes(selected.id),
      )
    : sorted;
  const { featured, regular } = blogSections(visible);
  return (
    <main id="main" className="container blog-layout">
      <BlogSidebar locale={locale} posts={sorted} topic={topic} />
      <div className="blog-main">
        <header className="blog-heading">
          <p className="eyebrow">LAVIK / BLOG</p>
          <h1>
            {selected
              ? selected.label[locale]
              : zh
                ? "Lavik 博客"
                : "Lavik Blog"}
          </h1>
          <p>
            {selected
              ? zh
                ? `探索 Lavik 的${selected.label[locale]}。`
                : `Explore ${selected.label.en.toLowerCase()} at Lavik.`
              : zh
                ? "了解 Lavik 的工作原理、最新进展，以及如何在应用中用好 NVMe SSD 容量。"
                : "How Lavik works, what we are building, and how to put NVMe SSD capacity to work in your applications."}
          </p>
        </header>
        {!topic && (
          <p className="blog-current-release">
            <Link href={`/${locale}/blog/lavik-0-2-0-released/`}>
              {zh ? "Lavik 0.2.0 已发布" : "Lavik 0.2.0 is here"} →
            </Link>
            {" · "}
            <Link href={`/${locale}/benchmarks/`}>
              {zh ? "最新性能报告" : "Latest performance reports"} →
            </Link>
          </p>
        )}
        {featured.length > 0 && (
          <section
            className="blog-featured"
            aria-label={zh ? "精选文章" : "Featured articles"}
          >
            {featured.map((article, index) => (
              <article
                className="blog-card blog-featured-card"
                key={article.id}
              >
                <Link
                  className="blog-card-link blog-featured-link"
                  href={articlePath(article)}
                >
                  <div className="blog-featured-art">
                    <BlogCover article={article} priority={index === 0} />
                  </div>
                  <div className="blog-featured-copy">
                    <p className="blog-featured-label">
                      <span aria-hidden="true">✦</span>{" "}
                      {zh ? "精选 · 深度解读" : "FEATURED · IN DEPTH"}
                    </p>
                    <h2>{article.title}</h2>
                    <p>{article.summary}</p>
                    <span className="blog-featured-cta">
                      {zh ? "阅读全文" : "Read the article"}{" "}
                      <span aria-hidden="true">↗</span>
                    </span>
                    <time dateTime={article.publishedAt ?? article.updatedAt}>
                      {article.publishedAt ?? article.updatedAt}
                    </time>
                  </div>
                </Link>
                <BlogTopicLinks article={article} />
              </article>
            ))}
          </section>
        )}
        {featured.length > 0 && regular.length > 0 && (
          <h2 className="blog-feed-heading">
            {zh ? "更多文章" : "More from Lavik"}
          </h2>
        )}
        <div className="article-list blog-feed">
          {regular.map((article, index) => (
            <article className="blog-card" key={article.id}>
              <Link className="blog-card-link" href={articlePath(article)}>
                <div className="blog-cover-frame">
                  <BlogCover
                    article={article}
                    priority={featured.length === 0 && index === 0}
                  />
                </div>
                <time dateTime={article.updatedAt}>{article.updatedAt}</time>
                <h2>
                  {article.title}
                  <span aria-hidden="true">↗</span>
                </h2>
                <p>{article.summary}</p>
              </Link>
              <BlogTopicLinks article={article} />
            </article>
          ))}
        </div>
        {!visible.length ? (
          <div className="blog-empty">
            <h2>
              {zh ? "这个主题的文章还在路上。" : "More to come in this topic."}
            </h2>
            <p>
              {zh
                ? "先看看最近发布的文章，了解 Lavik 的设计。"
                : "Explore the latest posts for a closer look at Lavik’s design."}
            </p>
            <Link className="button secondary" href={`/${locale}/blog/`}>
              {zh ? "查看全部文章" : "View all posts"}{" "}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
