import {Injectable} from '@angular/core';
import {MatSnackBar} from "@angular/material/snack-bar";
import {BehaviorSubject} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class HashyService {
  showHashy = new BehaviorSubject(false);

  constructor(private readonly snackBar: MatSnackBar) {
  }

  async show(text: string, milliseconds: number, showOkButton?: boolean) {
    this.showHashy.next(true);

    await this.snackBar.open(text, showOkButton ? 'Ok' : undefined, {
      duration: milliseconds,
      horizontalPosition: "left"
    }).afterDismissed().toPromise();

    this.showHashy.next(false);
  }
}
