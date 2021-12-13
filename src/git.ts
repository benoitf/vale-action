import * as github from '@actions/github';
import * as core from '@actions/core';

const API = github.getOctokit(process.env.GITHUB_TOKEN as string);
const CTX = github.context;

const cache: Record<string, undefined | number[]> = {};

export interface GHFile {
  name: string;
  patch: string;
  sha: string;
}

export function wasLineAddedInPR(file: GHFile, line: number): boolean {
  let lines: number[] = [];

  const key = file.name + file.sha;
  if (key in cache) {
    lines = cache[key] as number[];
  } else {
    lines = parsePatch(file.patch);
    cache[key] = lines;
  }

  return lines.includes(line);
}

export async function modifiedFiles(): Promise<GHFile[]> {
  let files: GHFile[] = [];
  let commits: string[] = await getCommits();
  console.info('modifiedFiles: the list of commits are', commits);

  if (CTX.payload.repository) {
    const repo = CTX.payload.repository;
    const name = repo.owner.login || repo.owner.name;

    await Promise.all(
      commits.map(async commit => {
        const resp = await API.repos.getCommit({
          owner: name!,
          repo: repo.name,
          ref: commit
        });

        resp.data.files.forEach(file => {
          console.log('checking the file', file);
          if (file.status == 'modified' || file.status == 'added') {
            let entry: GHFile = {
              name: file.filename,
              patch: file.patch,
              sha: commit
            };
            files.push(entry);
          }
        });
      })
    );
  } else {
    core.error('Repo not set');
  }
  console.log('returning files', JSON.stringify(files, undefined, 2));
  return files;
}

async function getCommits(): Promise<string[]> {
  let commits: string[] = [];
  // console.info('payload for getCommits ', JSON.stringify(CTX.payload, undefined, 2));

  switch (CTX.eventName) {
    case 'pull_request':
    case 'pull_request_target':
      if (CTX.payload.pull_request && CTX.payload.repository) {
        const url = CTX.payload.pull_request.commits_url;
        const repo = CTX.payload.repository;

        const resp = await API.request(`GET ${url}`, {
          owner: repo.owner.login || repo.owner.name,
          repo: repo.name
        });
        console.info('response is', resp.data);
        resp.data.forEach((commit: {sha: string}) => {
          commits.push(commit.sha);
        });
        console.info('the list of commits are', commits);
      } else {
        core.warning(`Unable to retrieve PR info.`);
        core.warning(
          `PR: ${CTX.payload.pull_request}, Repo: ${CTX.payload.repository}`
        );
      }
      break;
      case 'push':
      CTX.payload.commits.forEach((commit: {id: string}) => {
        commits.push(commit.id);
      });
      break;
    default:
      core.warning(`Unrecognized event: ${CTX.eventName}`);
  }

  return commits;
}

export function parsePatch(patch: string): number[] {
  let lines: number[] = [];
  let start: number = 0;

  let position: number = 0;
  patch.split(/(?:\r\n|\r|\n)/g).forEach(line => {
    if (line.startsWith('@@')) {
      const added = line.split(' ')[2].split(',')[0];
      start = parseInt(added, 10);
    } else if (line.startsWith('+')) {
      lines.push(start + position);
    }
    if (!line.startsWith('-') && !line.startsWith('@@')) {
      position++;
    }
  });

  return lines;
}
