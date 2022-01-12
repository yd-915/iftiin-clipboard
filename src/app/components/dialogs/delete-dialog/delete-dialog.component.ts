import {Component, HostListener} from '@angular/core';
import {MatBottomSheetRef} from "@angular/material/bottom-sheet";
import {DataService} from "../../../services/data.service";

@Component({
  selector: 'app-delete-dialog',
  templateUrl: './delete-dialog.component.html',
  styleUrls: ['./delete-dialog.component.css']
})
export class DeleteDialogComponent {
  constructor(
    private readonly bottomSheetRef: MatBottomSheetRef<DeleteDialogComponent>,
    private readonly dataService: DataService) {
  }

  @HostListener('keydown', ['$event'])
  onKeyPressed(event: KeyboardEvent) {
    if (event.key == 'Enter') {
      this.deleteAll();
    } else if (event.key == 'Escape') {
      this.cancel();
    }

    event.stopPropagation();
  }

  deleteAll() {
    this.dataService.clearCache();
    this.bottomSheetRef.dismiss();
  }

  cancel() {
    this.bottomSheetRef.dismiss();
  }
}
