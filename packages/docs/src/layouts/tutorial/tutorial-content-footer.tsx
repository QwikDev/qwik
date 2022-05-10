import type { TutorialApp } from '@tutorial-data';

export const TutorialContentFooter = ({ current, prev, next }: TutorialContentFooterProps) => {
  return (
    <div class="content-footer">
      <div>
        <button
          class="show-me"
          onClick$={() => {
            // why doesn't this work?
            // store.inputs = current.solutionInputs;
          }}
          type="button"
        >
          Show Me
        </button>
      </div>
      <nav>
        {prev ? (
          <a title={prev.title} href={`/tutorial/${prev.id}`} class="nav-link prev">
            &lt; Previous
          </a>
        ) : null}
        {next ? (
          <a title={next.title} href={`/tutorial/${next.id}`} class="nav-link next">
            Next &gt;
          </a>
        ) : null}
      </nav>
    </div>
  );
};

interface TutorialContentFooterProps {
  current: TutorialApp;
  prev?: TutorialApp;
  next?: TutorialApp;
}
