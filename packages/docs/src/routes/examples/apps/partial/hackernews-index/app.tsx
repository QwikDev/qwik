import { component$, isServer, useSignal, useStyles$, useTask$ } from '@qwik.dev/core';
import HackerNewsCSS from './hacker-news.css?inline';

export const HackerNews = component$(() => {
  useStyles$(HackerNewsCSS);
  const data = useSignal<IStory[]>();

  useTask$(async () => {
    if (isServer) {
      const response = await fetch('https://node-hnapi.herokuapp.com/news?page=0');
      data.value = await response.json();
    }
  });

  return (
    <div class="hacker-news">
      <Nav />
      <Stories stories={data.value} />
    </div>
  );
});

export const Nav = component$(() => {
  return (
    <nav>
      <header class="header">
        <nav class="inner">
          <a href="/">
            <strong>HN</strong>
          </a>
          <a href="/?type=new">
            <strong>New</strong>
          </a>
          <a href="/?type=show">
            <strong>Show</strong>
          </a>
          <a href="/?type=ask">
            <strong>Ask</strong>
          </a>
          <a href="/?type=job">
            <strong>Jobs</strong>
          </a>
          <a class="github" href="http://github.com/QwikDev/qwik" target="_blank" rel="noreferrer">
            Built with Qwik
          </a>
        </nav>
      </header>
    </nav>
  );
});

export const Stories = component$<{ stories?: IStory[] }>(({ stories }) => {
  const page = 1;
  const type = 'list';
  return (
    <main class="news-view">
      <section class="news-list-nav">
        {page > 1 ? (
          <a class="page-link" href={`/?type=${type}&page=${page - 1}`} aria-label="Previous Page">
            {'<'} prev
          </a>
        ) : (
          <span class="page-link disabled" aria-disabled="true">
            {'<'} prev
          </span>
        )}
        <span>page {page}</span>
        {stories && stories.length >= 29 ? (
          <a class="page-link" href={`/?type=${type}&page=${page + 1}`} aria-label="Next Page">
            more {'>'}
          </a>
        ) : (
          <span class="page-link disabled" aria-disabled="true">
            more {'>'}
          </span>
        )}
      </section>
      <article class="news-list">
        {stories && (
          <ul>
            {stories.map((story: IStory) => (
              <StoryPreview story={story} />
            ))}
          </ul>
        )}
      </article>
    </main>
  );
});

export const StoryPreview = component$<{ story: IStory }>((props) => {
  return (
    <li class="news-item">
      <span class="score">{props.story.points}</span>
      <span class="title">
        {props.story.url && !props.story.url.startsWith('item?id=') ? (
          <>
            <a href={props.story.url} target="_blank" rel="noreferrer">
              {props.story.title}
            </a>
            <span class="host"> ({props.story.domain})</span>
          </>
        ) : (
          <a href={`/item/${props.story.id}`}>{props.story.title}</a>
        )}
      </span>
      <br />
      <span class="meta">
        {props.story.type !== 'job' ? (
          <>
            by <a href={`/users/${props.story.user}`}>{props.story.user}</a> {props.story.time_ago}{' '}
            |{' '}
            <a href={`/stories/${props.story.id}`}>
              {props.story.comments_count ? `${props.story.comments_count} comments` : 'discuss'}
            </a>
          </>
        ) : (
          <a href={`/stories/${props.story.id}`}>{props.story.time_ago}</a>
        )}
      </span>
      {props.story.type !== 'link' && (
        <>
          {' '}
          <span class="label">{props.story.type}</span>
        </>
      )}
    </li>
  );
});

export interface IComment {
  id: string;
  user: string;
  time_ago: string;
  content: string;
  comments: IComment[];
}

export interface IStory {
  id: string;
  points: string;
  url: string;
  title: string;
  domain: string;
  type: string;
  time_ago: string;
  user: string;
  comments_count: number;
  comments: IComment[];
}
