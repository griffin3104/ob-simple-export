import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { DEFAULT_SETTINGS, SimpleExportSettings, SimpleExportSettingTab } from './settings';

export default class SimpleExportPlugin extends Plugin {
	settings!: SimpleExportSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SimpleExportSettingTab(this.app, this));
		registerCommands(this);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SimpleExportSettings> | null,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
