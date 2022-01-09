import {Injectable} from '@angular/core';
import {Tab} from "../models";
import {RedoService} from "./redo.service";

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  constructor(private readonly redoService: RedoService) {
  }

  undo(index: number): boolean {
    return this.redoService.undo(index);
  }

  redo(index: number): boolean {
    return this.redoService.redo(index);
  }

  save(index: number, tab: Tab) {
    this.redoService.do(index);

    const tabCopy = JSON.parse(JSON.stringify(tab)) as Tab;
    tabCopy.notes?.forEach(x => x.selected = false);
    tabCopy.taskLists?.forEach(x => x.selected = false);
    tabCopy.images?.forEach(x => x.selected = false);

    const key = "clipboard_data_" + index;
    const content = JSON.stringify(tabCopy);
    localStorage.setItem(key, content);
  }

  fetch(index: number): Tab | null {
    const key = "clipboard_data_" + index;
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data) as Tab;
    } else {
      return null;
    }
  }

  remove(index: number) {
    this.redoService.remove(index);

    const key = "clipboard_data_" + index;

    localStorage.removeItem(key);
  }

  getJsonFromAll(): Tab[] {
    let tabs: Tab[] = [];

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
