'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import { byteOffsetAt, getBinPath, canonicalizeGOPATHPrefix } from './util';
import { promptForMissingTool } from './goInstallTools';
import { getGoVersion, SemVersion, goKeywords, isPositionInString } from './util';

interface ImplLocation {

}


export class GoImplementationProvider implements vscode.ImplementationProvider {
	private goConfig = null;

	constructor(goConfig?: vscode.WorkspaceConfiguration) {
		this.goConfig = goConfig;
	}

	public provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
		return getGoVersion().then((ver: SemVersion) => {
			return new Promise<vscode.Definition>((resolve, reject) => {
				let filename = canonicalizeGOPATHPrefix(document.fileName);
				let cwd = path.dirname(filename);
				let offset = byteOffsetAt(document, position);

				let goGuru = getBinPath('guru');
				let buildTags = '"' + vscode.workspace.getConfiguration('go')['buildTags'] + '"';

				if (token.isCancellationRequested) {
					resolve(null);
					return;
				}

				// let args = ['-json', 'implements', document.fileName + ':#' + document.offsetAt(position)];
				let args = ['-tags', buildTags, 'implements', `${filename}:#${offset.toString()}`];
				let process = cp.execFile(goGuru, args, {}, (err, stdout, stderr) => {
					if (err && (<any>err).code === 'ENOENT') {
						promptForMissingTool('guru');
						return resolve(null);
					}

					if (err) {
						console.error(err);
						return resolve(null);
					}

					let lines = stdout.toString().split('\n');
					let results: vscode.Location[] = [];
					for (let i = 0; i < lines.length; i++) {
						let line = lines[i];
						let match = /^(.*):(\d+)\.(\d+)-(\d+)\.(\d+):/.exec(lines[i]);
						if (!match) continue;
						let [_, file, lineStartStr, colStartStr, lineEndStr, colEndStr] = match;
						let referenceResource = vscode.Uri.file(path.resolve(cwd, file));
						if (referenceResource.fsPath === cwd) continue;
						let range = new vscode.Range(
							+lineStartStr - 1, +colStartStr - 1, +lineEndStr - 1, +colEndStr
						);
						console.log('found:', referenceResource.fsPath, range);
						// resolve(new vscode.Location(referenceResource, range));
						// return;
						results.push(new vscode.Location(referenceResource, range));
					}
					resolve(results);
				});

				token.onCancellationRequested(e => process.kill());
			});
		}, err => {
			if (err) {
				console.log(err);
			}
			return Promise.resolve(null);
		});
	}
}
