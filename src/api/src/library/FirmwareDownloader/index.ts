/* eslint-disable no-await-in-loop */
import simpleGit, { ResetMode, SimpleGit, SimpleGitOptions } from 'simple-git';
import * as fs from 'fs';
import path from 'path';
import Commander, { CommandResult } from '../Commander';

interface FirmwareDownloaderProps {
  baseDirectory: string;
  gitBinaryLocation: string;
}

export interface FirmwareResult {
  path: string;
}

export interface IFirmwareDownloader {
  checkoutTag(
    repository: string,
    srcFolder: string,
    tagName: string
  ): Promise<FirmwareResult>;

  checkoutBranch(
    repository: string,
    srcFolder: string,
    branchName: string
  ): Promise<FirmwareResult>;

  checkoutCommit(
    repository: string,
    srcFolder: string,
    commit: string
  ): Promise<FirmwareResult>;
}

export const findGitExecutable = async (envPath: string): Promise<string> => {
  const IS_WINDOWS = process.platform.startsWith('win');
  const exenames = IS_WINDOWS ? ['git.exe', 'git'] : ['git'];

  // eslint-disable-next-line no-restricted-syntax
  for (const location of envPath.split(path.delimiter)) {
    // eslint-disable-next-line no-restricted-syntax
    for (const exename of exenames) {
      const executable = path
        .normalize(path.join(location, exename))
        .replace(/"/g, '');
      try {
        let res: CommandResult | null = null;
        if (
          fs.existsSync(executable) &&
          // eslint-disable-next-line no-cond-assign
          (res = await new Commander().runCommand(executable, ['--version']))
        ) {
          console.log('tested git exec', executable);
          if (res.success) {
            console.log('confirmed git exec', executable);
            return executable;
          }
        }
      } catch (err) {
        console.warn(executable, err);
      }
    }
  }
  throw new Error('git exec not found');
};

export class GitFirmwareDownloader implements IFirmwareDownloader {
  baseDirectory: string;

  gitBinaryLocation: string;

  constructor({ baseDirectory, gitBinaryLocation }: FirmwareDownloaderProps) {
    this.baseDirectory = baseDirectory;
    this.gitBinaryLocation = gitBinaryLocation;
  }

  getRepoDirectory(repository: string): string {
    return path.join(this.baseDirectory, path.basename(repository));
  }

  getSimpleGit(repository: string) {
    const options: SimpleGitOptions = {
      baseDir: this.getRepoDirectory(repository),
      binary: this.gitBinaryLocation,
      maxConcurrentProcesses: 1,
      config: [],
    };
    return simpleGit(options);
  }

  async syncRepo(repository: string, srcFolder: string): Promise<void> {
    const directory = this.getRepoDirectory(repository);

    if (!fs.existsSync(directory)) {
      await fs.promises.mkdir(directory, { recursive: true });
    }

    const git = this.getSimpleGit(directory);

    const isTargetDirectoryEmpty: boolean =
      (await fs.promises.readdir(directory)).length === 0;

    if (isTargetDirectoryEmpty) {
      await git.clone(repository, directory, [
        '--no-checkout',
        '--filter=blob:none',
      ]);
      if (!srcFolder || srcFolder.length === 0 || srcFolder === '/') {
        await git.raw('checkout');
      } else {
        await git.raw('sparse-checkout', 'set', srcFolder);
      }
    } else {
      await git.reset(ResetMode.HARD);
      await git.fetch('origin', ['--tags']);
    }
  }

  async checkoutTag(
    repository: string,
    srcFolder: string,
    tagName: string
  ): Promise<FirmwareResult> {
    const directory = this.getRepoDirectory(repository);
    await this.syncRepo(repository, srcFolder);
    const git = this.getSimpleGit(directory);
    await git.checkout(tagName);
    return {
      path: path.join(directory, srcFolder),
    };
  }

  async checkoutBranch(
    repository: string,
    srcFolder: string,
    branch: string
  ): Promise<FirmwareResult> {
    const directory = this.getRepoDirectory(repository);
    await this.syncRepo(repository, srcFolder);
    const git = this.getSimpleGit(directory);
    await git.checkout(`origin/${branch}`);
    return {
      path: path.join(directory, srcFolder),
    };
  }

  async checkoutCommit(
    repository: string,
    srcFolder: string,
    commit: string
  ): Promise<FirmwareResult> {
    const directory = this.getRepoDirectory(repository);
    await this.syncRepo(repository, srcFolder);
    const git = this.getSimpleGit(directory);
    await git.checkout(commit);
    return {
      path: path.join(directory, srcFolder),
    };
  }
}
