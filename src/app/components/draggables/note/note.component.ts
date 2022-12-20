import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges, OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {MatDialog} from "@angular/material/dialog";
import {MatMenuTrigger} from "@angular/material/menu";
import {htmlRegex} from "@clipboardjesus/const";
import {DraggableNote, Note, NoteList, TaskList} from "@clipboardjesus/models";
import {DataService, HashyService} from "@clipboardjesus/services";
import {EditNoteDialogComponent} from "@clipboardjesus/components";
import {ClipboardService} from "@clipboardjesus/services";
import {_blank} from "@clipboardjesus/const";
import {marked, Renderer} from 'marked';

@Component({
  selector: 'cb-note',
  templateUrl: './note.component.html',
  styleUrls: ['./note.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoteComponent implements OnInit, OnChanges, OnDestroy {
  @Input() note!: Note;
  @Input() changed?: EventEmitter<void> | undefined;

  rippleDisabled = false;

  mouseDown = false;
  movedPx = 0;

  @ViewChild(MatMenuTrigger)
  contextMenu!: MatMenuTrigger;
  rightClickPosX = 0;
  rightClickPosY = 0;

  @ViewChild('code')
  codeElement?: ElementRef;

  parsedMarkdownContent = '';

  overdue = false;
  nearlyOverdue = false;

  timers: number[] = [];

  get canInteract(): boolean {
    return this.movedPx < 5;
  }

  constructor(
    private readonly clipboard: ClipboardService,
    private readonly hashy: HashyService,
    private readonly dialog: MatDialog,
    public readonly dataService: DataService,
    private readonly cdr: ChangeDetectorRef,
  ) {
  }

  ngOnInit(): void {
    if (!this.note) {
      throw new Error('NoteComponent.note is necessary!');
    }

    this.updateMarkdown();
    if (this.note.code !== false
      && this.note.content
      && htmlRegex.test(this.note.content)) {
      this.note.code = true;
    }

    this.cdr.markForCheck();
  }

  /**
   * Marks the note when a reminder is overdue.
   * @param changes
   */
  ngOnChanges(changes: SimpleChanges): void {
    const note = changes['note']?.currentValue as Note | undefined;
    const reminder = note?.reminder;
    if (!reminder) {
      return;
    }

    this.disposeTimers();

    const now = new Date();
    let then: Date;

    if (reminder.date && reminder.time) {
      then = new Date(`${reminder.date}T${reminder.time}:00`);
    } else if (reminder.date) {
      then = new Date(`${reminder.date}T${now.getHours()}:${now.getMinutes()}:00`);
    } else if (reminder.time) {
      then = new Date(`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}T${reminder.time}:00`);
    } else {
      this.note.reminder = undefined;
      return;
    }

    const minutesUntilOverdue = (then!.getTime() - now.getTime()) / 1000 / 60;
    const minutesUntilReminder = minutesUntilOverdue - (reminder.before ?? 0);

    this.nearlyOverdue = minutesUntilReminder <= 0;
    this.overdue = minutesUntilOverdue <= 0;

    const setOverdue = () => {
      this.dataService.setError(this.note.id);
      this.overdue = true;
      this.cdr.markForCheck();
    }
    if (this.overdue) {
      setOverdue();
    } else {
      this.timers.push(
        setTimeout(
          () => setOverdue(),
          minutesUntilOverdue * 60 * 1000
        )
      );
    }

    const setNearlyOverdue = () => {
      this.dataService.setWarning(this.note.id);
      this.nearlyOverdue = true;
      this.cdr.markForCheck();
    }
    if (this.nearlyOverdue) {
      setNearlyOverdue();
    } else {
      this.timers.push(
        setTimeout(
          () => setNearlyOverdue(),
          minutesUntilReminder * 60 * 1000
        )
      );
    }
  }

  private disposeTimers(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }

  private updateMarkdown(): void {
    const renderer = new Renderer();

    renderer.link = (href: string | null, title: string | null, text: string) => {
      if (!title) {
        return `<a href="${href}" target="${_blank}">${text}</a>`;
      }
      return `<a title="${title}" href="${href}" target="${_blank}">${text}</a>`;
    };
    renderer.options.breaks = true;
    renderer.text = (text: string) => {
      while (text.match(/^(&nbsp;)*?\s+/)) {
        text = text.replace(' ', '&nbsp;');
      }
      return text;
    }

    this.parsedMarkdownContent = marked.parse(this.note.content ?? '', {renderer});

    this.cdr.markForCheck();
  }

  select(): void {
    this.note.selected = !this.note.selected;
    this.changed?.emit();
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button !== 2) {
      this.mouseDown = true;
    }
  }

  onMouseMove(): void {
    if (this.mouseDown) {
      this.movedPx++;
    } else {
      this.movedPx = 0;
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (this.mouseDown && this.canInteract) {
      switch (event.button) {
        case 0:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            this.select();
          } else {
            this.copy();
          }
          break;
        case 1:
          this.delete(event);
          break;
        case 2:
          break;
      }

      event.stopPropagation();
    }

    this.mouseDown = false;
  }

  copy(): void {
    if (this.note.content && !this.rippleDisabled && this.canInteract) {
      this.clipboard.set(this.note.content);
      this.hashy.show('COPIED_TO_CLIPBOARD', 600);
    }
  }

  edit(event: MouseEvent, stopPropagation?: boolean): void {
    if (this.canInteract) {
      const note = {...this.note};
      this.dialog.open(EditNoteDialogComponent, {
        width: 'var(--width-edit-dialog)',
        data: note,
        disableClose: true,
      }).afterClosed().subscribe((editedNote: Note) => {
        if (editedNote) {
          this.dataService.deleteNote(this.note, true);
          this.dataService.addNote(editedNote);
          this.cdr.markForCheck();
        }
      });
      this.rippleDisabled = false;
      if (stopPropagation) {
        event.stopPropagation();
      }
    }
  }

  delete(event: MouseEvent): void {
    if (this.canInteract) {
      this.dataService.deleteNote(this.note);
      event.stopPropagation();
    }
  }

  toggleCodeView(event: MouseEvent, stopPropagation?: boolean): void {
    if (this.canInteract) {
      this.note.code = !this.note.code;
      this.rippleDisabled = false;
      if (stopPropagation) {
        event.stopPropagation();
      }
    }
  }

  moveToTab(index: number): void {
    this.dataService.moveNoteToTab(index, this.note);
    this.cdr.markForCheck();
  }

  copyColorFrom(item: Note | TaskList | NoteList): void {
    this.note.backgroundColor = item.backgroundColor;
    this.note.backgroundColorGradient = item.backgroundColorGradient;
    this.note.foregroundColor = item.foregroundColor;
    this.cdr.markForCheck();
    this.dataService.cacheData();
  }

  connectTo(item: DraggableNote | undefined): void {
    if (item === undefined) {
      this.dataService.disconnectAll(this.note);
    } else {
      this.dataService.connect(this.note, item);
    }
    this.changed?.emit();
    this.dataService.cacheData();
  }

  showContextMenu(event: MouseEvent): void {
    if (this.canInteract) {
      event.preventDefault();
      event.stopPropagation();

      this.rightClickPosX = event.clientX;
      this.rightClickPosY = event.clientY;
      this.contextMenu.openMenu();
    }
    this.rippleDisabled = false;
    this.mouseDown = false;
  }

  ngOnDestroy(): void {
    this.disposeTimers();
  }
}
