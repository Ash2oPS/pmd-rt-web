import { options, runChecks } from '../../pmd-verify-change/scripts/checks.mjs';

try {
  const args = options(process.argv.slice(2), true);
  const names = args.suites.includes('all') ? ['all'] : [...new Set(args.suites)];
  const plan = names.map(name => `browser:${name}`);
  const report = args.run ? await runChecks(plan, { url: args.url }) : { status: 'planned', plan, url: args.url };
  console.log(JSON.stringify(report)); process.exitCode = report.status === 'failed' ? 1 : 0;
} catch (error) {
  console.log(JSON.stringify({ status: 'error', error: error.message })); process.exitCode = 2;
}
