import {Injectable} from '@angular/core';
import {Tab} from "@clipboardjesus/models";
import {HistoryService, StorageService} from "@clipboardjesus/services";

/**
 * The service to handle all the cached data
 * including undo, redo, etc.
 */
@Injectable({
  providedIn: 'root',
})
export class CacheService {
  /** Whether the user can redo the last undone action. */
  redoPossible = this.redoService.redoPossible;
  /** Whether the user can undo the last action. */
  undoPossible = this.redoService.undoPossible;
  /** Whether the user can restore the lastly deleted tab. */
  restorePossible = this.redoService.restorePossible;

  /**
   * Create an instance of the cache service.
   */
  constructor(
    private readonly redoService: HistoryService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Read the last state of the tab and write it into the localstorage.
   * @param index The index of the tab.
   */
  undo(index: number): boolean {
    return this.redoService.undo(index);
  }

  /**
   * Read the previous undone state of the tab and write it into the localstorage.
   * @param index The index of the tab.
   */
  redo(index: number): boolean {
    return this.redoService.redo(index);
  }

  /**
   * Recreate the last deleted tab.
   */
  recreate(): Tab | undefined {
    return this.redoService.recreate();
  }

  /**
   * Switches the undo and redo information from the provided tabs
   * @param left The index of the tab.
   * @param right The index of the other tab.
   */
  switchHistory(left: number, right: number): void {
    this.redoService.switchHistory(left, right);
  }

  /**
   * Save the tab and update the change history.
   * @param index The index of the tab.
   * @param tab The content to save.
   */
  save(index: number, tab: Tab): void {
    this.redoService.do(index);

    const tabCopy = JSON.parse(JSON.stringify(tab)) as Tab;
    tabCopy.notes?.forEach(x => x.selected = undefined);
    tabCopy.taskLists?.forEach(x => x.selected = undefined);
    tabCopy.images?.forEach(x => x.selected = undefined);
    tabCopy.noteLists?.forEach(x => x.selected = undefined);

    this.storageService.setTab(tabCopy, index);
  }

  /**
   * Reads the tab from the localstorage.
   * @param index The index of the tab.
   * @returns the {@link Tab} which was stored.
   */
  fetch(index: number): Tab | undefined {
    return this.storageService.fetchTab(index);
  }

  /**
   * Delete the tab and update the change history.
   * @param index The index of the deleted tab.
   */
  remove(index: number): void {
    this.redoService.remove(index);
    this.storageService.deleteTab(index);
  }

  /**
   * Gets a {@link Tab} array of all currently available tabs.
   * The maximum size is 20.
   */
  getJsonFromAll(): Tab[] {
    const tabs: Tab[] = [];
    for (let i = 0; i < 20; i++) {
      const tab = this.fetch(i);
      if (tab) {
        tab.index = i;
        tabs.push(tab);
      }
    }
    return tabs;
  }
}
