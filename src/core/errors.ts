/** プレイヤーに表示してよいルール違反（「そこには置けません」など） */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
