import {
	collectDocsAuthoringAuditArtifacts,
	type DocsAuthoringContract,
	validateDocsAuthoringContract,
} from "../src/reference/content/contract";
import {
	DOCS_AUTHORING_MALFORMED_FIXTURE,
	DOCS_AUTHORING_VALIDATION_FIXTURE,
} from "../src/reference/content/runbook";

function run(): void {
	const args = process.argv.slice(2);
	const fixtureType = args.includes("--fixture") 
		? args[args.indexOf("--fixture") + 1] 
		: "valid";

	let fixture: unknown;
	if (fixtureType === "valid") {
		fixture = DOCS_AUTHORING_VALIDATION_FIXTURE;
	} else if (fixtureType === "malformed") {
		fixture = DOCS_AUTHORING_MALFORMED_FIXTURE;
	} else {
		console.error(`Unknown fixture type: ${fixtureType}`);
		process.exit(1);
	}

	const violations = validateDocsAuthoringContract(fixture);

	if (violations.length > 0) {
		console.error("Contract validation failed with violations:");
		for (const v of violations) {
			console.error(` - ${v}`);
		}
		process.exit(1);
	}

	console.log(`docs:validate OK - fixture '${fixtureType}' complies with the offline docs-writing contract.`);
	console.log(
		JSON.stringify(
			{
				auditArtifacts: collectDocsAuthoringAuditArtifacts(fixture as DocsAuthoringContract),
			},
			null,
			2,
		),
	);
}

run();
