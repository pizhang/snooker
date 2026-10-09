@echo off
rem One-click launcher for the snooker scoreboard.
rem Serves the main scoreboard over its fixed local address to retain microphone permission.
rem Needs a Python 3. Edit PYTHON below if yours lives somewhere else.

setlocal
set "HERE=%~dp0"
set "PYTHON="

where py >nul 2>nul && set "PYTHON=py -3"
if not defined PYTHON (
  where python >nul 2>nul && set "PYTHON=python"
)
if not defined PYTHON (
  if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" (
    set "PYTHON=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
  )
)

if not defined PYTHON (
  echo.
  echo No Python 3 found. Install it from python.org, or edit serve.bat and set PYTHON
  echo to the full path of any python.exe, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting the snooker scoreboard on a local address...
%PYTHON% "%HERE%serve.py" %*
if errorlevel 1 (
  echo.
  echo The server did not start. Run the command above by hand to see the error.
  pause
)
endlocal
