import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { Background, BackgroundStyle, CardBack, Felt, Invitation, Membership, ResultLayout, SurfaceStyle, Team, TeamDecks, TeamRole } from './teams.models';

@Injectable({ providedIn: 'root' })
export class TeamsService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/teams';

  listTeams() {
    return firstValueFrom(this.http.get<Team[]>(`${this.base}/`));
  }
  createTeam(name: string) {
    return firstValueFrom(this.http.post<Team>(`${this.base}/`, { name }));
  }
  getTeam(id: number) {
    return firstValueFrom(this.http.get<Team>(`${this.base}/${id}/`));
  }
  renameTeam(id: number, name: string) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { name }));
  }
  // Partiel : le reset d'une surface ne renvoie que sa propre couleur, le serveur
  // ne touchant qu'aux champs presents dans le PATCH.
  setAppearance(id: number, colors: Partial<{ card_back_color: string; felt_color: string; background_color: string }>) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, colors));
  }
  deleteTeam(id: number) {
    return firstValueFrom(this.http.delete(`${this.base}/${id}/`));
  }

  getDecks(id: number) {
    return firstValueFrom(this.http.get<TeamDecks>(`${this.base}/${id}/decks/`));
  }
  setDecks(id: number, deckIds: number[]) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { deck_ids: deckIds }));
  }
  setCardBack(id: number, cardBackId: number | null) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { card_back_id: cardBackId }));
  }
  setFelt(id: number, feltId: number | null) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { felt_id: feltId }));
  }
  setBackground(id: number, backgroundId: number | null) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { background_id: backgroundId }));
  }
  /** Le fond a son propre setter : son style admet 'theme', que setSurfaceStyle
   * ne connait pas. */
  setBackgroundStyle(id: number, style: BackgroundStyle) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { background_style: style }));
  }
  private decksBase = getRuntimeConfig().apiBaseUrl + '/api/v1/decks';
  uploadCardBack(name: string, image: File) {
    return firstValueFrom(this.http.post<CardBack>(`${this.decksBase}/card-backs/`, this.imageForm(name, image)));
  }
  uploadFelt(name: string, image: File) {
    return firstValueFrom(this.http.post<Felt>(`${this.decksBase}/felts/`, this.imageForm(name, image)));
  }
  uploadBackground(name: string, image: File) {
    return firstValueFrom(this.http.post<Background>(`${this.decksBase}/backgrounds/`, this.imageForm(name, image)));
  }
  deleteCardBack(id: number) {
    return firstValueFrom(this.http.delete(`${this.decksBase}/card-backs/${id}/`));
  }
  deleteFelt(id: number) {
    return firstValueFrom(this.http.delete(`${this.decksBase}/felts/${id}/`));
  }
  deleteBackground(id: number) {
    return firstValueFrom(this.http.delete(`${this.decksBase}/backgrounds/${id}/`));
  }
  private imageForm(name: string, image: File): FormData {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('image', image);
    return fd;
  }
  setSurfaceStyle(id: number, surface: 'card_back' | 'felt', style: SurfaceStyle) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { [`${surface}_style`]: style }));
  }
  /** Comment le depouillement s'affiche a la place de la main, une fois les votes
   * reveles. Les salles deja ouvertes gardent la leur : le serveur la fige a la
   * creation. */
  setResultLayout(id: number, layout: ResultLayout) {
    return firstValueFrom(this.http.patch<Team>(`${this.base}/${id}/`, { result_layout: layout }));
  }

  getMembers(id: number) {
    return firstValueFrom(this.http.get<Membership[]>(`${this.base}/${id}/members/`));
  }
  changeRole(teamId: number, userId: number, role: TeamRole) {
    return firstValueFrom(this.http.patch<Membership>(`${this.base}/${teamId}/members/${userId}/`, { role }));
  }
  removeMember(teamId: number, userId: number) {
    return firstValueFrom(this.http.delete(`${this.base}/${teamId}/members/${userId}/`));
  }

  getInvitations(id: number) {
    return firstValueFrom(this.http.get<Invitation[]>(`${this.base}/${id}/invitations/`));
  }
  invite(teamId: number, email: string, role: TeamRole) {
    return firstValueFrom(this.http.post<Invitation>(`${this.base}/${teamId}/invitations/`, { email, role }));
  }
  revokeInvite(teamId: number, invId: number) {
    return firstValueFrom(this.http.delete(`${this.base}/${teamId}/invitations/${invId}/`));
  }

  acceptInvite(token: string) {
    return firstValueFrom(this.http.post<Team>(`${this.base}/invitations/accept/`, { token }));
  }
}
