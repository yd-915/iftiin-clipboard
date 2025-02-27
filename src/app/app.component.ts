import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  OnInit,
  ViewChild
} from '@angular/core';
import {MatBottomSheet} from "@angular/material/bottom-sheet";
import {MatDialog} from "@angular/material/dialog";
import {MatMenuTrigger} from "@angular/material/menu";
import {ActivatedRoute, Router} from "@angular/router";
import {CdkDragDrop, CdkDragEnd} from "@angular/cdk/drag-drop";
import {TranslateService} from "@ngx-translate/core";
import {dialog} from "@tauri-apps/api";
import {take} from "rxjs";
import {
  AboutDialogComponent,
  DeleteDialogComponent,
  EditNoteDialogComponent,
  EditTabDialogComponent,
  EditTaskListDialogComponent,
  EditNoteListDialogComponent,
  EditImageDialogComponent
} from "@clipboardjesus/components";
import {
  Note,
  Tab,
  TaskList,
  NoteList,
  Image
} from '@clipboardjesus/models';
import {
  CacheService,
  DataService,
  FileAccessService,
  HashyService,
  SettingsService,
  ClipboardService
} from "@clipboardjesus/services";

/**
 * The main component of the application.
 */
@Component({
  selector: 'cb-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  /** The context menu binding. */
  @ViewChild(MatMenuTrigger)
  contextMenu!: MatMenuTrigger;
  /** The x position for the context menu. */
  rightClickPosX = 0;
  /** The y position for the context menu. */
  rightClickPosY = 0;
  /** The x position for new draggable items to be created at. */
  newDraggablePositionX = 0;
  /** The y position for new draggable items to be created at. */
  newDraggablePositionY = 0;

  /** The event that fires when any of the visible draggable items is changed. */
  draggableChanged = new EventEmitter<void>();

  /** Whether the current clipboard content can be pasted. */
  canPasteItems = false;
  /** The current count for the idiot award Easter egg. */
  logoReplacedEasterEggCount = 0;
  /** Whether the app is correctly initialized. */
  initialized = false;
  /** Whether it's Christmas currently. */
  christmas: boolean;

  /** Set the currently selected tab index (in the {@link DataService}). */
  set tabIndex(value: number) {
    this.draggableChanged.emit();
    this.dataService.selectedTabIndex = value;
  }
  /** Get the currently selected tab index. */
  get tabIndex(): number {
    return this.dataService.selectedTabIndex;
  }

  /**
   * Main entry point of the application.
   * @param dialog reference to the material dialog
   * @param bottomSheet reference to the material bottom sheet
   * @param clipboard reference to the clipboard service
   * @param dataService reference to the data service
   * @param hashy reference to the hashy service
   * @param router reference to the angular router
   * @param activatedRoute reference to the angular activated route
   * @param cache reference to the cache service
   * @param translate reference to the ngx translate service
   * @param settings reference to the settings service
   * @param fileAccessService reference to the file access service
   * @param cdr reference to the change detector
   */
  constructor(
    private readonly dialog: MatDialog,
    private readonly bottomSheet: MatBottomSheet,
    private readonly clipboard: ClipboardService,
    public readonly dataService: DataService,
    public readonly hashy: HashyService,
    private readonly router: Router,
    private readonly activatedRoute: ActivatedRoute,
    private readonly cache: CacheService,
    private readonly translate: TranslateService,
    public readonly settings: SettingsService,
    private readonly fileAccessService: FileAccessService,
    cdr: ChangeDetectorRef,
  ) {
    const date = new Date();
    this.christmas = date.getMonth() === 11 && date.getDate() <= 27;
    dataService.changeDetectionRequired.subscribe(() => cdr.markForCheck());
  }

  /**
   * Instantiate the app with the data stored in the localstorage.
   */
  ngOnInit(): void {
    this.activatedRoute.queryParams.pipe(take(2)).subscribe(async (params) => {
      if (this.initialized) {
        return;
      }

      const sharedTab = params['params'];
      if (sharedTab) {
        const tab = JSON.parse(atob(sharedTab));
        if (typeof tab !== 'string') {
          if (this.dataService.tabs.length === 1
            && this.dataService.itemsCount === 0) {
            this.cache.save(0, tab);
            this.dataService.selectedTabIndex = 0;
          } else {
            this.dataService.addTab(tab);
            this.dataService.moveLastTabToFirstPosition();
            this.dataService.selectedTabIndex = 0;
          }
        }

        // Clear the query params and initialize the app from localstorage
        await this.router.navigate(['.'], {relativeTo: this.activatedRoute});
        this.reloadApp();
      } else {
        // Hack for fade in animation on startup
        setTimeout(() => this.initialized = true);
      }
    });

    this.draggableChanged.emit();
  }

  /**
   * The tabs can be moved via drag and drop.
   * This function is called when the user drags and drops a tab to another position.
   * @param event
   */
  dropTab(event: CdkDragDrop<Tab[]>): void {
    let from = +event.previousContainer.id;
    const to = +event.container.id;
    const curr = this.dataService.selectedTabIndex;

    if (from === curr) {
      // Moving currently selected tab
      this.dataService.selectedTabIndex = to;
    } else if (from < curr && to >= curr) {
      // Moving tab from left to right (over currently selected tab)
      this.dataService.selectedTabIndex--;
    } else if (from > curr && to <= curr) {
      // Moving tab from right to left (over currently selected tab)
      this.dataService.selectedTabIndex++;
    }

    while (from < to) {
      // Moving tab from left to right
      this.dataService.reArrangeTab(from, ++from);
    }
    while (from > to) {
      // Moving tab from right to left
      this.dataService.reArrangeTab(from, --from);
    }
  }

  /**
   * Gets all tab indices except the one with the given index.
   * This is used for the drag and drop feature of tabs.
   * @param index
   */
  getAllListConnections(index: number): string[] {
    return this.dataService.tabs.filter(x => x.index !== index).map(x => `${x.index}`);
  }

  /**
   * All the keybindings are handled here.
   * TODO: Move this to a separate service.
   * @param event
   */
  @HostListener('document:keydown', ['$event'])
  async onKeyDown(event: KeyboardEvent): Promise<void> {
    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    if (this.dataService.selectedItemsCount) {
      switch (key) {
        case 'Delete':
        case 'Backspace':
          this.deleteSelectedItems();
          this.draggableChanged.emit();
          return;
        case 'ArrowUp':
          this.dataService.editAllSelectedItems(x => x.posY--);
          this.draggableChanged.emit();
          this.dataService.cacheData();
          return;
        case 'ArrowDown':
          this.dataService.editAllSelectedItems(x => x.posY++);
          this.draggableChanged.emit();
          this.dataService.cacheData();
          return;
        case 'ArrowLeft':
          this.dataService.editAllSelectedItems(x => x.posX--);
          this.draggableChanged.emit();
          this.dataService.cacheData();
          return;
        case 'ArrowRight':
          this.dataService.editAllSelectedItems(x => x.posX++);
          this.draggableChanged.emit();
          this.dataService.cacheData();
          return;
        case 'Escape':
          this.dataService.removeAllSelections();
          this.draggableChanged.emit();
          return;
        case 'c':
          if (ctrl) {
            await this.copySelectedItems();
            this.draggableChanged.emit();
          }
          return;
        case 'x':
          if (ctrl) {
            await this.cutSelectedItems();
            this.draggableChanged.emit();
          }
          return;
      }
    }

    if (ctrl || shift || alt) {
      switch (key) {
        case 't':
        case 'n':
          if (event.shiftKey) {
            this.dataService.restoreTab();
          } else {
            this.dataService.addTab();
          }
          return;
        case 'T':
          this.dataService.restoreTab();
          return;
        case 'w':
          this.dataService.removeCurrentTab();
          return;
        case 'v':
          await this.dataService.importItemsFromClipboard();
          this.draggableChanged.emit();
          return;
        case 'z':
          if (event.shiftKey) {
            this.dataService.redo();
          } else {
            this.dataService.undo();
          }
          this.draggableChanged.emit();
          return;
        case 'y':
          this.dataService.redo();
          this.draggableChanged.emit();
          return;
        case 'a':
          this.dataService.selectAll();
          event.preventDefault();
          this.draggableChanged.emit();
          return;
        case 's':
          if (event.shiftKey) {
            await this.saveAs();
          } else {
            await this.save();
          }
          event.preventDefault();
          return;
        case 'ArrowLeft':
          this.dataService.selectNextTab(true);
          event.preventDefault();
          event.stopPropagation();
          this.draggableChanged.emit();
          return;
        case 'ArrowRight':
          this.dataService.selectNextTab(false);
          event.preventDefault();
          event.stopPropagation();
          this.draggableChanged.emit();
          return;
      }
    }

    switch (key) {
      case 'Tab':
        this.dataService.selectNextItem(event.shiftKey);
        event.preventDefault();
        event.stopPropagation();
        this.draggableChanged.emit();
        return;
      case 'PageUp':
        this.dataService.selectNextTab(true);
        event.preventDefault();
        event.stopPropagation();
        this.draggableChanged.emit();
        return;
      case 'PageDown':
        this.dataService.selectNextTab(false);
        event.preventDefault();
        event.stopPropagation();
        this.draggableChanged.emit();
        return;
    }
  }

  /**
   * Copies all the selected items as a JSON to the clipboard.
   * This can be pasted in the same or different tab.
   */
  async copySelectedItems(): Promise<void> {
    const selectedItems = this.dataService.getSelectedItems();
    await this.clipboard.set(JSON.stringify(selectedItems));
    this.dataService.removeAllSelections();
    this.draggableChanged.emit();
  }

  /**
   * Does simply the same as {@link copySelectedItems()}
   * but also deletes the selected items.
   */
  async cutSelectedItems(): Promise<void> {
    const selectedItems = this.dataService.getSelectedItems();
    await this.clipboard.set(JSON.stringify(selectedItems));
    this.dataService.deleteSelectedItems();
    this.dataService.removeAllSelections();
    this.draggableChanged.emit();
  }

  /**
   * This feature is not yet fully implemented.
   * Currently, it creates a link with the whole data as a JSON in the query params.
   * Later it should be possible to just have an id to the data and load it from the server.
   * But due to the fact that i have currently no backend developed, this is not possible xD.
   */
  async shareTab(): Promise<void> {
    const params = JSON.stringify(this.dataService.getAsJson(true));
    const route = window.location.href.split('?')[0];
    await this.clipboard.set(`${route}?params=${btoa(params)}`);
    this.hashy.show('COPIED_URL_TO_CLIPBOARD', 3000, 'OK');
  }

  /**
   * Saves all the data to the file system.
   */
  async save(): Promise<void> {
    return this.dataService.saveAll();
  }

  /**
   * Opens a dialog to specify the name of the file to save.
   */
  async saveAs(): Promise<void> {
    await this.dataService.saveAllAs();
  }

  /**
   * Opens a dialog to select a file to import.
   * This method is currently just used in the desktop version of the app.
   */
  async openFileDialog(): Promise<void> {
    const options = {
      multiple: false,
      filters: [{
        name: '*.boards.json | JSON',
        extensions: ['boards.json']
      }]
    };
    return dialog.open(options).then(async (path) => {
      if (typeof path !== 'string') {
        return;
      }

      const contents = await this.fileAccessService.read(path);
      if (contents) {
        const tabs = JSON.parse(contents) as Tab[];
        const isTabsArray = Array.isArray(tabs)
          && tabs[0].index !== undefined
          && tabs[0].color !== undefined
          && (tabs[0].images?.length
            || tabs[0].notes?.length
            || tabs[0].noteLists?.length
            || tabs[0].taskLists?.length);
        const importFile: () => void = () => {
          this.dataService.clearCache();
          this.dataService.tabs = tabs;
          this.dataService.selectedTabIndex = 0;
          this.dataService.cacheAllData();
        }

        if (isTabsArray) {
          importFile();
        } else {
          this.hashy.show('Could not read file', 7000, 'Try anyway', () =>
            importFile()
          );
        }
      }
    })
  }

  /**
   * Saves the current tab into the file system when no item is selected.
   * When one or more items are selected the method will save
   * the current selection as a tab into the file system.
   */
  saveTabOrSelection(): void {
    this.dataService.saveTabOrSelection();
    this.draggableChanged.emit();
  }

  /**
   * Delete the currently selected items.
   */
  deleteSelectedItems(): void {
    this.dataService.deleteSelectedItems();
    this.draggableChanged.emit();
  }

  /**
   * Opens a dialog to create a new note.
   */
  openNewNoteDialog(): void {
    this.dialog.open(EditNoteDialogComponent, {
      width: 'var(--width-edit-dialog)',
      data: new Note(null, this.newDraggablePositionX, this.newDraggablePositionY, ''),
    }).afterClosed().subscribe((note) => {
      if (note) {
        this.dataService.addNote(note);
        this.draggableChanged.emit();
      }
    });
  }

  /**
   * Opens a dialog to create a new note list.
   */
  openNewNoteListDialog(): void {
    this.dialog.open(EditNoteListDialogComponent, {
      width: 'var(--width-edit-dialog)',
      data: new NoteList(null, this.newDraggablePositionX, this.newDraggablePositionY),
    }).afterClosed().subscribe((noteList) => {
      if (noteList) {
        this.dataService.addNoteList(noteList);
        this.draggableChanged.emit();
      }
    });
  }

  /**
   * Opens a dialog to create a new task list.
   */
  openNewTaskListDialog(): void {
    this.dialog.open(EditTaskListDialogComponent, {
      width: 'var(--width-edit-dialog)',
      data: new TaskList(null, this.newDraggablePositionX, this.newDraggablePositionY),
    }).afterClosed().subscribe((taskList) => {
      if (taskList) {
        this.dataService.addTaskList(taskList);
        this.draggableChanged.emit();
      }
    });
  }

  /**
   * Opens a dialog to create a new image.
   */
  openNewImageDialog(): void {
    this.dialog.open(EditImageDialogComponent, {
      width: 'var(--width-edit-dialog)',
      data: new Image(null, this.newDraggablePositionX, this.newDraggablePositionY, null),
      autoFocus: false,
    }).afterClosed().subscribe((image) => {
      if (image) {
        this.dataService.addImage(image);
        this.draggableChanged.emit();
      }
    });
  }

  /**
   * Opens the dialog to edit the currently visited tab.
   */
  openEditTabDialog(): void {
    this.dialog.open(EditTabDialogComponent, {
      width: 'var(--width-edit-dialog)',
      data: {
        tab: this.dataService.tabs[this.dataService.selectedTabIndex],
        changeFn: () => this.draggableChanged.emit(),
      },
      disableClose: true,
    }).afterClosed().subscribe((tab) => {
      if (tab) {
        this.dataService.cacheData();
        this.dataService.updateAppTitle();
      } else {
        this.dataService.tabs[this.dataService.selectedTabIndex] = this.cache.fetch(this.dataService.selectedTabIndex)!;
      }
      this.draggableChanged.emit();
    });
  }

  /**
   * Opens a dialog which will delete all items if submitted.
   */
  clearAllForever(): void {
    this.bottomSheet.open(DeleteDialogComponent);
    this.draggableChanged.emit();
  }

  /**
   * Opens the about-dialog.
   */
  showAboutDialog(): void {
    this.dialog.open(AboutDialogComponent);
  }

  /**
   * Simply reloads the whole application.
   */
  reloadApp(): void {
    window.location.reload();
  }

  /**
   * Easter egg 🐰
   */
  replaceLogo(event: CdkDragEnd): void {
    let question = 'Hmmpf...';
    let answer: string | undefined = 'Okay.. sorry';
    switch (this.logoReplacedEasterEggCount) {
      case 0:
        question = 'Hey... Stop that..';
        answer = 'Ups';
        break;
      case 1:
        question = 'Are you okay?';
        answer = "I'm fine";
        break;
      case 2:
        question = 'What are you doing?!';
        answer = 'Just kidding';
        break;
      case 3:
        question = 'Why?';
        answer = "Uhm..";
        break;
      case 4:
        question = 'Stop that!';
        answer = 'Kk..';
        break;
      case 5:
        question = 'Stop that!! Now!';
        answer = 'Okaaaay!';
        break;
      case 6:
        question = 'Are you kidding me?!';
        answer = 'Maybe';
        break;
      case 7:
        question = 'What is your f***ing problem?!';
        answer = "Ok.. I'll stop";
        break;
      case 8:
        question = 'You need help!';
        answer = '...';
        break;
      case 9:
        question = '...';
        answer = undefined;
        break;
      case 10:
        question = 'Congratulations.. you won the idiot award';
        answer = undefined;
        const idiotAward = new Note(
          'easter_egg',
          0,
          160,
          '( ︶︿︶)_🖕',
          'Idiot award',
        );
        idiotAward.posZ = 100;
        idiotAward.backgroundColor = '#FFDA0054';
        idiotAward.foregroundColor = '#FEE858';
        this.dataService.addNote(idiotAward);
        this.draggableChanged.emit();
        break;
    }
    this.hashy.show(question, 5000, answer, undefined, () => {
      this.logoReplacedEasterEggCount++;
      event.source._dragRef.reset();
    });
  }

  /**
   * Open the main context menu of a tab.
   * This method saves the current mouse position to create
   * the draggable at this position (if chosen in context menu).
   * @param event
   * @param ignoreMousePosition If {@link true} the new draggable
   *  will be created in the top left corner of the tab
   */
  showContextMenu(event: MouseEvent, ignoreMousePosition?: boolean): void {
    event.preventDefault();
    this.rightClickPosX = event.clientX;
    this.rightClickPosY = event.clientY;
    this.dataService.canImportItemsFromClipboard().then(val => this.canPasteItems = val);
    this.contextMenu.openMenu();
    this.newDraggablePositionX = ignoreMousePosition ? 10 : this.rightClickPosX;
    this.newDraggablePositionY = ignoreMousePosition ? 61 : this.rightClickPosY;
  }
}
