<script>
	import '@evidence-dev/tailwind/fonts.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { EvidenceDefaultLayout } from '@evidence-dev/core-components';

	export let data;

	const gtmContainerId = import.meta.env.VITE_GTM_CONTAINER_ID;
	const ga4Environment = import.meta.env.VITE_GA4_ENV ?? '';
	const promotionId = import.meta.env.VITE_GA4_PROMOTION_ID ?? '';
	const reportDefinitionId = import.meta.env.VITE_GA4_REPORT_DEF_ID ?? '';

	onMount(() => {
		if (!gtmContainerId) return;

		window.dataLayer = window.dataLayer || [];
		window.dataLayer.push({
			'gtm.start': new Date().getTime(),
			event: 'gtm.js'
		});

		const script = document.createElement('script');
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmContainerId)}`;
		document.head.appendChild(script);

		let lastSentPagePath = '';
		const unsubscribe = page.subscribe(($page) => {
			const currentPath = $page.url.pathname + $page.url.search;
			if (currentPath === lastSentPagePath) return;
			lastSentPagePath = currentPath;

			window.dataLayer.push({
				event: 'spa_page_view',
				page_location: $page.url.href,
				page_path: currentPath,
				env: ga4Environment,
				promotion_id: promotionId,
				report_def_id: reportDefinitionId
			});
		});

		return () => {
			unsubscribe();
			script.remove();
		};
	});
</script>

<EvidenceDefaultLayout {data}>
	<slot slot="content" />
</EvidenceDefaultLayout>