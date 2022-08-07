// eslint-disable-next-line no-shadow
export enum CustomPermissionsBitfield {
  MANAGE_QUEUE = 1 << 0,
  ADD_SONGS = 1 << 1,
  ADD_PLAYLISTS = 1 << 2,
  MANAGE_PLAYER = 1 << 3,
  MANAGE_FILTERS = 1 << 4,
  CREATE_PLAYER = 1 << 5,
}

const PermissionNames = [
  ["MANAGE_QUEUE", CustomPermissionsBitfield.MANAGE_QUEUE],
  ["ADD_SONGS", CustomPermissionsBitfield.ADD_SONGS],
  ["ADD_PLAYLISTS", CustomPermissionsBitfield.ADD_PLAYLISTS],
  ["MANAGE_PLAYER", CustomPermissionsBitfield.MANAGE_PLAYER],
  ["MANAGE_FILTERS", CustomPermissionsBitfield.MANAGE_FILTERS],
  ["CREATE_PLAYER", CustomPermissionsBitfield.CREATE_PLAYER],
];
export class CustomPermissions {
  public bitfield: number;

  constructor(bitfield: number | string = 0) {
    this.bitfield = Number(bitfield);
  }

  has(permission: CustomPermissionsBitfield) {
    return (this.bitfield & permission) === permission;
  }

  add(permission: CustomPermissionsBitfield) {
    if (!this.has(permission)) this.bitfield |= permission;
    return this;
  }

  remove(permission: CustomPermissionsBitfield) {
    if (this.has(permission)) this.bitfield &= permission;
    return this;
  }

  toArray(): string[] {
    return PermissionNames.filter(([, bit]) => this.has(Number(bit))).map(
      ([name]) => String(name)
    );
  }
}
