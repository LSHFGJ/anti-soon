import { overviewDocsPage } from "./overview";
import { architectureDocsPage } from "./pages/architecture";
import { createProjectDocsPage } from "./pages/create-project";
import { dashboardAndLeaderboardDocsPage } from "./pages/dashboard-and-leaderboard";
import { dataFlowDocsPage } from "./pages/data-flow";
import { deploymentsAndRepositoriesDocsPage } from "./pages/deployments-and-repositories";
import { exploreProjectsDocsPage } from "./pages/explore-projects";
import { gettingStartedDocsPage } from "./pages/getting-started";
import { glossaryDocsPage } from "./pages/glossary";
import { operationsDocsPage } from "./pages/operations";
import { securityDocsPage } from "./pages/security";
import { submitPocDocsPage } from "./pages/submit-poc";
import { troubleshootingDocsPage } from "./pages/troubleshooting";
import { whyAntiSoonDocsPage } from "./pages/why-antisoon";

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
	DocsMermaidBlock,
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
	whyAntiSoonDocsPage,
	architectureDocsPage,
	dataFlowDocsPage,
	securityDocsPage,
	operationsDocsPage,
	troubleshootingDocsPage,
	gettingStartedDocsPage,
	submitPocDocsPage,
	exploreProjectsDocsPage,
	createProjectDocsPage,
	dashboardAndLeaderboardDocsPage,
	glossaryDocsPage,
	deploymentsAndRepositoriesDocsPage,
]);

export const docsSourceManifest = DOCS_CONTENT;

export {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_RUNBOOK,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
};
