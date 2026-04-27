import pytest
from bson import ObjectId
from app.models.user import UserModel


class TestUserTelegram:
    def test_find_by_telegram_id_returns_none_when_unset(self, db, test_user):
        assert UserModel.find_by_telegram_id(123456789) is None

    def test_set_and_find_by_telegram_id(self, db, test_user):
        UserModel.set_telegram_link(str(test_user['_id']), 123456789, 'sepehr')
        found = UserModel.find_by_telegram_id(123456789)
        assert found is not None
        assert found['_id'] == test_user['_id']
        assert found['telegram_username'] == 'sepehr'
        assert 'telegram_linked_at' in found

    def test_clear_telegram_link_unsets_fields(self, db, test_user):
        UserModel.set_telegram_link(str(test_user['_id']), 123456789, 'sepehr')
        UserModel.clear_telegram_link(str(test_user['_id']))
        assert UserModel.find_by_telegram_id(123456789) is None
        u = UserModel.find_by_id(str(test_user['_id']))
        assert u.get('telegram_id') is None
