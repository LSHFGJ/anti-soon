import { overviewDocsPage } from "./overview";
import { apiAndContractsDocsPage } from "./pages/api-and-contracts";
import { architectureDocsPage } from "./pages/architecture";
import { createProjectDocsPage } from "./pages/create-project";
import { dashboardAndLeaderboardDocsPage } from "./pages/dashboard-and-leaderboard";
import { dataFlowDocsPage } from "./pages/data-flow";
import { exploreProjectsDocsPage } from "./pages/explore-projects";
import { gettingStartedDocsPage } from "./pages/getting-started";
import { glossaryDocsPage } from "./pages/glossary";
import { operationsDocsPage } from "./pages/operations";
import { securityDocsPage } from "./pages/security";
import { submitPocDocsPage } from "./pages/submit-poc";
import { troubleshootingDocsPage } from "./pages/troubleshooting";

import {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_RUNBOOK,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
} from "./runbook";
import { defineDocsContentCollection } from "./schema";

export type {
	DocsAnchor,
	DocsCalloutBlock,
	DocsCalloutTone,
	DocsContentBlock,
	DocsContentCollection,
	DocsListBlock,
	DocsListStyle,
	DocsPage,
	DocsParagraphBlock,
	DocsSection,
	DocsStepItem,
	DocsStepsBlock,
} from "./schema";
export {
	assertDocsContentCollection,
	collectDocsContentCollectionViolations,
	DOCS_BLOCK_TYPES,
	DOCS_CALLOUT_TONES,
	DOCS_LIST_STYLES,
	DOCS_LOCALES,
} from "./schema";

export const DOCS_CONTENT = defineDocsContentCollection([
	overviewDocsPage,
	architectureDocsPage,
	dataFlowDocsPage,
	apiAndContractsDocsPage,
	securityDocsPage,
	operationsDocsPage,
	troubleshootingDocsPage,
	gettingStartedDocsPage,
	submitPocDocsPage,
	exploreProjectsDocsPage,
	createProjectDocsPage,
	dashboardAndLeaderboardDocsPage,
	glossaryDocsPage,
]);

export const docsSourceManifest = DOCS_CONTENT;

export {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_RUNBOOK,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
};
