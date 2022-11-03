import { component$, useClientEffect$, useStore } from '@builder.io/qwik';
import { Framework } from '@prisma/client';
import { trpc } from '~/client/trpc';

export default component$(() => {
	const store = useStore({ items: [] as Framework[] });

	useClientEffect$(async ({ cleanup }) => {
		const controller = new AbortController();
		cleanup(() => controller.abort());
		const items = await trpc.framework.list.query('', {
			signal: controller.signal,
		});
		store.items = items;
	});

	return (
		<div>
			Records:
			{store.items.map((item) => (
				<>
					<div>Id: {item.id}</div>
					<div>Name: {item.name}</div>
					<hr />
				</>
			))}
		</div>
	);
});
