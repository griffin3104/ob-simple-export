import { App, PluginSettingTab, Setting } from 'obsidian';
import type SimpleExportPlugin from './main';

export interface SimpleExportSettings {
	/** Absolute path of the folder that exports are written to. `~/` is expanded. */
	outputDir: string;
	/** Name of the sub folder (inside the export root) that receives images and other embedded files. */
	attachmentsDirName: string;
	/** Replace `[[wikilinks]]` with plain text so they do not show up as brackets in the exported file. */
	stripWikilinks: boolean;
}

export const DEFAULT_SETTINGS: SimpleExportSettings = {
	outputDir: '',
	attachmentsDirName: 'attachments',
	stripWikilinks: true,
};

export class SimpleExportSettingTab extends PluginSettingTab {
	plugin: SimpleExportPlugin;

	constructor(app: App, plugin: SimpleExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Output folder')
			.setDesc(
				'Absolute path that exports are written to. A leading ~/ is allowed. It must be outside the vault.',
			)
			.addText((text) =>
				text
					.setPlaceholder('~/export')
					.setValue(this.plugin.settings.outputDir)
					.onChange(async (value) => {
						this.plugin.settings.outputDir = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Attachments folder name')
			.setDesc(
				'Embedded images and files are copied into this folder inside the export, and the links are rewritten to match.',
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.attachmentsDirName)
					.setValue(this.plugin.settings.attachmentsDirName)
					.onChange(async (value) => {
						const name = value.trim().replace(/[\\/]/g, '');
						this.plugin.settings.attachmentsDirName =
							name || DEFAULT_SETTINGS.attachmentsDirName;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Convert wikilinks to plain text')
			.setDesc(
				'Turn [[note]] and [[note|alias]] into note and alias. Turn this off to keep them as they are.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripWikilinks)
					.onChange(async (value) => {
						this.plugin.settings.stripWikilinks = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
