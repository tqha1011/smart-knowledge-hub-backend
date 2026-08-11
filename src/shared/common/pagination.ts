import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageNumber must be an integer' })
  @Min(1, { message: 'pageNumber must be at least 1' })
  pageNumber: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be at least 1' })
  pageSize: number = 20;
}

export class PageResult<T> {
  items: T[];
  totalPages: number;
  currentPage: number;
  pageNumber: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;

  constructor(
    items: T[],
    totalItems: number,
    pageNumber: number,
    currentPage: number,
    pageSize: number,
  ) {
    this.items = items;
    this.totalPages = Math.ceil(totalItems / pageSize);
    this.currentPage = currentPage;
    this.pageNumber = pageNumber;
    this.pageSize = pageSize;
    this.hasPrevious = currentPage > 1;
    this.hasNext = currentPage < this.totalPages;
  }
}

export type PaginationRequest = {
  pageNumber: number;
  pageSize: number;
};
