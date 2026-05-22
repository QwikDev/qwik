import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getRecommendations } from './catalog.server';
import { ProductCard } from './product-card';

export const RecommendationRail = component$((props: { productId: string; runId: string }) => {
  const recommendations = useAsync$(getRecommendations, props);

  return (
    <Suspense fallback={<section class="rail muted">Loading recommendations...</section>}>
      <section class="rail">
        <div class="section-heading">
          <h2>Recommended next</h2>
          <span>reads: {recommendations.value.reads}</span>
        </div>
        <div class="grid compact">
          {recommendations.value.ids.map((productId) => (
            <ProductCard key={productId} productId={productId} runId={props.runId} />
          ))}
        </div>
      </section>
    </Suspense>
  );
});
