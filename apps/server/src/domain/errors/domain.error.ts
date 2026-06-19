export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND");
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(message = "Permission denied") {
    super(message, "PERMISSION_DENIED");
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class AlreadyExistsError extends DomainError {
  constructor(entity: string, identifier: string) {
    super(
      `${entity} with identifier ${identifier} already exists`,
      "ALREADY_EXISTS",
    );
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED");
  }
}
