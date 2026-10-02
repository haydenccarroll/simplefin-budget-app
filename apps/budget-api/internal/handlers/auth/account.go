package auth

import (
	"net/http"

	"budget-app/apps/budget-api/internal/auth"
	"budget-app/apps/budget-api/internal/queries"
)

// Me returns the signed-in user's account.
//
// @Summary      Who am I
// @Tags         auth
// @Produce      json
// @Success      200 {object} userResponse
// @Failure      401
// @Router       /v1/auth/me [get]
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toUserResponse(user))
}

type updateProfileRequest struct {
	// Any field left out is left alone.
	Username  *string `json:"username"`
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
	Timezone  *string `json:"timezone"`
	// CurrentPassword is required to change the username: it is what you sign
	// in with, so a stolen session shouldn't be able to lock you out of it.
	CurrentPassword string `json:"current_password"`
}

// UpdateMe changes the signed-in user's name, username or timezone.
//
// @Summary      Change name, username or timezone
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        profile body updateProfileRequest true "Fields to change"
// @Success      200 {object} userResponse
// @Failure      400
// @Failure      401
// @Failure      403
// @Failure      409
// @Router       /v1/auth/me [patch]
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	var req updateProfileRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "that request doesn't look right")
		return
	}

	params := queries.UpdateUserProfileParams{
		ID: user.ID, Username: user.Username, FirstName: user.FirstName, LastName: user.LastName, Timezone: user.Timezone,
	}
	if req.FirstName != nil {
		name, ok := cleanName(*req.FirstName)
		if !ok {
			writeError(w, http.StatusBadRequest, "names can be at most 100 characters")
			return
		}
		params.FirstName = name
	}
	if req.LastName != nil {
		name, ok := cleanName(*req.LastName)
		if !ok {
			writeError(w, http.StatusBadRequest, "names can be at most 100 characters")
			return
		}
		params.LastName = name
	}
	if req.Timezone != nil {
		tz, ok := cleanTimezone(*req.Timezone)
		if !ok {
			writeError(w, http.StatusBadRequest, "that timezone isn't recognized")
			return
		}
		params.Timezone = tz
	}
	if req.Username != nil {
		username, ok := normalizeUsername(*req.Username)
		if !ok {
			writeError(w, http.StatusBadRequest, usernameRules)
			return
		}
		if username != user.Username {
			if !h.checkCurrentPassword(w, r, user, req.CurrentPassword) {
				return
			}
			params.Username = username
		}
	}

	ctx := r.Context()
	if err := h.Queries.UpdateUserProfile(ctx, params); isDuplicateKey(err) {
		writeError(w, http.StatusConflict, "that username is taken")
		return
	} else if err != nil {
		h.Logger.ErrorContext(ctx, "failed to update profile", "error", err, "user_id", user.ID)
		writeError(w, http.StatusInternalServerError, "failed to save your profile")
		return
	}
	writeJSON(w, http.StatusOK, userResponse{
		ID: user.ID, Username: params.Username, FirstName: params.FirstName, LastName: params.LastName, Timezone: params.Timezone,
	})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword sets a new password and signs out every other session, so a
// stolen session doesn't survive it.
//
// @Summary      Change password
// @Tags         auth
// @Accept       json
// @Param        passwords body changePasswordRequest true "Current and new password"
// @Success      204
// @Failure      400
// @Failure      401
// @Failure      403
// @Router       /v1/auth/change-password [post]
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	var req changePasswordRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "that request doesn't look right")
		return
	}
	if err := auth.CheckPasswordPolicy(req.NewPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !h.checkCurrentPassword(w, r, user, req.CurrentPassword) {
		return
	}

	ctx := r.Context()
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		h.Logger.ErrorContext(ctx, "failed to hash password", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to change your password")
		return
	}
	if err := h.Queries.UpdateUserPassword(ctx, queries.UpdateUserPasswordParams{PasswordHash: hash, ID: user.ID}); err != nil {
		h.Logger.ErrorContext(ctx, "failed to update password", "error", err, "user_id", user.ID)
		writeError(w, http.StatusInternalServerError, "failed to change your password")
		return
	}
	if err := h.Queries.DeleteUserSessionsExcept(ctx, queries.DeleteUserSessionsExceptParams{
		UserID: user.ID, TokenHash: auth.HashToken(auth.SessionToken(r)),
	}); err != nil {
		h.Logger.ErrorContext(ctx, "failed to sign out other sessions", "error", err, "user_id", user.ID)
	}
	w.WriteHeader(http.StatusNoContent)
}
