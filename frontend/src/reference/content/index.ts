import { overviewDocsPage } from "./overview";
import {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_RUNBOOK,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
} from "./runbook";
import { defineDocsContentCollection } from "./schema";

export {
	assertDocsContentCollection,
	collectDocsContentCollectionViolations,
	DOCS_BLOCK_TYPES,
	DOCS_CALLOUT_TONES,
	DOCS_LIST_STYLES,
	DOCS_LOCALES,
} from "./schema";

export type {
	DocsAnchor,
	DocsCalloutBlock,
	DocsCalloutTone,
	DocsContentBlock,
	DocsContentCollection,
	DocsPage,
	DocsListBlock,
	DocsListStyle,
	DocsParagraphBlock,
	DocsSection,
	DocsStepItem,
	DocsStepsBlock,
} from "./schema";

export const DOCS_CONTENT = defineDocsContentCollection([overviewDocsPage]);

export const docsSourceManifest = DOCS_CONTENT;

export {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_RUNBOOK,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
};
