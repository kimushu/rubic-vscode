import * as request from "request";
import * as GitHub from "github";
import { promisify } from "util";

const RAWGITHUB_HOST = "https://raw.githubusercontent.com";

export interface GitHubRepository {
    owner: string;
    repo: string;
    branch?: string;
}

export function readGithubFile(repo: GitHubRepository, filename: string, encoding?: string): Promise<Buffer|string> {
    let url = `${RAWGITHUB_HOST}/${repo.owner}/${repo.repo}/${repo.branch||"master"}/${filename}`;
    // First, try access from direct rawgithub URL
    return promisify(request)({url, encoding: null}).then((resp) => {
        return resp.body;
    }).catch((error) => {
        // If direct access failed, try again via GitHub API
        // (This is a more reliable way but consumes API limit)
        return new GitHub().repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            ref: repo.branch || "master",
            path: filename,
        }).then(({data}) => {
            return Buffer.from(data.content, data.encoding);
        });
    }).then((buf: Buffer) => {
        if (encoding != null) {
            return buf.toString(encoding);
        }
        return buf;
    });
}
