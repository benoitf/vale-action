import * as core from '@actions/core';
import * as github from '@actions/github';
import * as tmp from 'tmp';

import {CheckRunner} from './check';
import * as input from './input';

import execa from 'execa';

/**
 * These environment variables are exposed for GitHub Actions.
 *
 * See https://bit.ly/2WlFUD7 for more information.
 */
const {GITHUB_TOKEN, GITHUB_WORKSPACE} = process.env;

export async function run(actionInput: input.Input): Promise<void> {
  try {
    const startedAt = new Date().toISOString();
    console.info('before execa run', actionInput.args);
    const valeProcess=  execa('vale', actionInput.args);
    console.info('valeProcess is', valeProcess);
    
    if (valeProcess.stdout) {
      valeProcess.stdout.pipe(process.stdout);
    }
    if (valeProcess.stderr) {
      valeProcess.stderr.pipe(process.stderr);
    }

    let runner = new CheckRunner(actionInput.files);
    console.log('checkrunner is on');
    const alertResp = await valeProcess;
    console.log('after valeProcess is done');

    let sha = github.context.sha;
    if (github.context.payload.pull_request) {
      sha = github.context.payload.pull_request.head.sha;
    }

    console.log('runner.makeAnnotations');
    runner.makeAnnotations(alertResp.stdout);
    await runner.executeCheck({
      token: actionInput.token,
      name: 'Vale',
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      head_sha: sha,
      started_at: startedAt,
      context: {vale: actionInput.version}
    });
  } catch (error) {
    console.log('there was a failure', error);
    core.setFailed(error.stderr);
  }
}

async function main(): Promise<void> {
  try {
    const userToken = GITHUB_TOKEN as string;
    const workspace = GITHUB_WORKSPACE as string;

    const tmpobj = tmp.fileSync({postfix: '.ini', dir: workspace});
    const actionInput = await input.get(tmpobj, userToken, workspace);
    console.info('action Input is', actionInput);
    await run(actionInput);

    tmpobj.removeCallback();
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
