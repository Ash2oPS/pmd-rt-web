import { changedFiles, options, planChecks, runChecks } from './checks.mjs';

try {
  const args = options(process.argv.slice(2));
  const files = args.files ?? changedFiles();
  const plan = planChecks(files, args.area, args.release);
  const report = args.run ? await runChecks(plan, { url: args.url }) : {
    status: 'planned', files: files.slice(0, 12), omittedFiles: Math.max(0, files.length - 12), plan, url: args.url };
  if (!plan.length) report.note = 'No runtime checks selected. Validate changed skills/docs separately; this is not a gameplay pass.';
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'failed' ? 1 : 0;
} catch (error) {
  console.log(JSON.stringify({ status: 'error', error: error.message })); process.exitCode = 2;
}
