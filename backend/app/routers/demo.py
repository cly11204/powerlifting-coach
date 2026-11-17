"""Load / remove the SIMULATED demo athlete. Never touches real athletes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.demo.simulate import create_demo, remove_demo

router = APIRouter(prefix="/api/demo", tags=["demo (simulated data)"])


@router.post("", response_model=schemas.AthleteOut, status_code=201)
def load_demo(db: Session = Depends(get_db)):
    return create_demo(db)


@router.delete("")
def delete_demo(db: Session = Depends(get_db)):
    return {"removed_demo_athletes": remove_demo(db)}
