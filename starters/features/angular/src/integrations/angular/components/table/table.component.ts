import { type AfterViewInit, Component, ViewChild, Input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import type { QwikifiedComponentProps } from '@builder.io/qwik-angular';

export interface TableUserData {
  id: string;
  name: string;
  progress: string;
  fruit: string;
}

type TableComponentInputs = 'users';
export type TableComponentProps = QwikifiedComponentProps<TableComponent, TableComponentInputs>;

@Component({
  selector: 'app-table-component',
  styleUrls: ['table.component.scss'],
  templateUrl: 'table.component.html',
  standalone: true,
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule],
})
export class TableComponent implements AfterViewInit {
  displayedColumns: string[] = ['id', 'name', 'progress', 'fruit'];
  dataSource = new MatTableDataSource<TableUserData>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  @Input()
  set users(users: TableUserData[]) {
    this.dataSource = new MatTableDataSource(users);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }
}
